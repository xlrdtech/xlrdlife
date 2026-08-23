/* EliOS theme controller. LIGHT is default (qi: "light mode first").
   Loaded synchronously in <head> so the stored theme applies before first
   paint (no flash). Persists choice to localStorage 'elios.theme'. */
(function(){
  var KEY = 'elios.theme';
  function cur(){ try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch(e){ return 'light'; } }
  function apply(t){ document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light'); }
  apply(cur());                      // immediate: prevents FOUC
  window.ELIOS_THEME = {
    get: cur,
    toggle: function(){
      var t = cur() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, t); } catch(e){}
      apply(t);
      return t;
    }
  };
  function wire(){
    var btn = document.getElementById('themeToggle');
    if(btn){ btn.addEventListener('click', function(){ window.ELIOS_THEME.toggle(); }); }
  }
  if(document.readyState !== 'loading'){ wire(); } else { document.addEventListener('DOMContentLoaded', wire); }
})();
