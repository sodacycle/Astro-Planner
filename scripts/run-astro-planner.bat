@echo off
cd /d %~dp0
start "" http://localhost:8000/astro.html
python -m http.server 8000
