/* Titik mulai aplikasi: dijalankan terakhir setelah semua modul dimuat */
if(!PG[cur])cur='Dashboard';
syinit();
lgcheck();
draw();
window.addEventListener('hashchange',()=>{if(document.getElementById('lg'))lgshow()});
