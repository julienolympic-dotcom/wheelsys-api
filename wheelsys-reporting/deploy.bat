@echo off
cd /d "%~dp0"
echo Deploiement en cours...
npx vercel --prod
echo.
echo Deploiement termine !
pause
