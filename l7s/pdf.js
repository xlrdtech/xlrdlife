/* L7S PDF theme toggle — DEFAULT LIGHT (corporate); persists per-device.
   PRINT ALWAYS RENDERS LIGHT regardless of the on-screen toggle. */
(function(){
  var KEY='l7s-theme', root=document.documentElement;
  function apply(t){ if(t==='dark'){root.setAttribute('data-theme','dark');} else {root.removeAttribute('data-theme');} }
  var saved=null; try{ saved=localStorage.getItem(KEY); }catch(e){}
  apply(saved==='dark'?'dark':'light');               // corporate default = light
  window.toggleTheme=function(){
    var next=root.getAttribute('data-theme')==='dark'?'light':'dark';
    apply(next); try{ localStorage.setItem(KEY,next); }catch(e){}
  };
  // force light for the print/PDF render, restore the user's choice after
  var prev=null;
  window.addEventListener('beforeprint',function(){ prev=root.getAttribute('data-theme'); root.removeAttribute('data-theme'); });
  window.addEventListener('afterprint',function(){ if(prev==='dark'){root.setAttribute('data-theme','dark');} });
})();
