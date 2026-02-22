(function(){
  const KEY='ui_theme';
  const root=document.documentElement;
  function apply(theme){
    root.classList.remove('theme-soft-light','theme-soft-dark');
    root.classList.add(theme);
    try{ localStorage.setItem(KEY, theme); }catch{}
    const btn=document.getElementById('themeToggle');
    if(btn) btn.setAttribute('aria-pressed', String(theme==='theme-soft-dark'));
  }
  function init(){
    let saved=null; try{ saved=localStorage.getItem(KEY);}catch{}
    if(saved){ apply(saved); }
    else{
      const prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;
      apply(prefersDark?'theme-soft-dark':'theme-soft-light');
    }
  }
  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('DOMContentLoaded', function(){
    const btn=document.getElementById('themeToggle');
    if(!btn) return;
    btn.addEventListener('click', function(){
      const next=root.classList.contains('theme-soft-dark')?'theme-soft-light':'theme-soft-dark';
      apply(next);
    });
  });
})();

