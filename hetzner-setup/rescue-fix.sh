#!/usr/bin/env bash
# Runs INSIDE the Hetzner rescue system. Mounts the installed RAID array,
# injects SSH key + sets root password to 0000 + enables plain password login,
# then the box reboots into the fixed OS.
set -euo pipefail

echo "=== assembling RAID + mounting installed root ==="
mdadm --assemble --scan || true
sleep 2
cat /proc/mdstat

# Find the root md array (the largest ext4 md device). installimage made md0=/boot, md1=swap, md2=/
ROOT_DEV=""
for d in /dev/md/2 /dev/md2 /dev/md127 /dev/md126 /dev/md125; do
  if [ -b "$d" ] && blkid "$d" 2>/dev/null | grep -qi ext4; then ROOT_DEV="$d"; break; fi
done
# fallback: pick the ext4 md with the most space
[ -z "$ROOT_DEV" ] && ROOT_DEV=$(lsblk -rno NAME,FSTYPE,TYPE | awk '$3=="raid1" && $2=="ext4"{print "/dev/"$1}' | head -1)
echo "ROOT_DEV=$ROOT_DEV"
[ -z "$ROOT_DEV" ] && { echo "FATAL: no ext4 root array found"; lsblk; exit 1; }

mkdir -p /mnt/inst
mount "$ROOT_DEV" /mnt/inst
# mount boot too if separate (for completeness)
echo "=== mounted; injecting key + password ==="

# 1. SSH key into installed OS
mkdir -p /mnt/inst/root/.ssh
chmod 700 /mnt/inst/root/.ssh
cat > /mnt/inst/root/.ssh/authorized_keys <<'PUBKEY'
__PUBKEY__
PUBKEY
chmod 600 /mnt/inst/root/.ssh/authorized_keys

# 2. Set root password to 0000 via chroot chpasswd
for fs in dev proc sys; do mount --bind /$fs /mnt/inst/$fs; done
echo 'root:0000' | chroot /mnt/inst chpasswd
echo "root password set to 0000"

# 3. Enable plain password login (qi wants normal password auth, no key-only)
SSHD=/mnt/inst/etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' "$SSHD"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' "$SSHD"
grep -q '^PasswordAuthentication' "$SSHD" || echo 'PasswordAuthentication yes' >> "$SSHD"
grep -q '^PermitRootLogin' "$SSHD" || echo 'PermitRootLogin yes' >> "$SSHD"
# also clear any cloud-init / drop-in that forces prohibit-password
for f in /mnt/inst/etc/ssh/sshd_config.d/*.conf; do
  [ -f "$f" ] && sed -i 's/^PasswordAuthentication.*/PasswordAuthentication yes/; s/^PermitRootLogin.*/PermitRootLogin yes/' "$f"
done
echo "sshd_config: password login enabled, root login yes"

# cleanup
for fs in dev proc sys; do umount /mnt/inst/$fs 2>/dev/null || true; done
umount /mnt/inst
echo "=== fix complete, ready to reboot into fixed OS ==="
