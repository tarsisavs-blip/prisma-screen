@echo off
chcp 65001 >nul
title Gerar instalador - prisma-screen
cd /d "%~dp0"
echo.
echo ===== prisma-screen: gerando o instalador =====
echo Isso pode levar alguns minutos. Nao feche esta janela.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O Node.js nao esta instalado. Veja o PASSO 1 do arquivo TUTORIAL-EXECUTAVEL.md
  pause
  exit /b 1
)

call npm install
if errorlevel 1 (
  echo [ERRO] Falha ao baixar as pecas necessarias. Verifique a internet e tente de novo.
  pause
  exit /b 1
)

call npm run dist
if errorlevel 1 (
  echo [ERRO] Falha ao criar o instalador. Copie a mensagem acima e envie para quem te ajuda.
  pause
  exit /b 1
)

echo.
echo ===== PRONTO! =====
echo O instalador esta na pasta "dist" (arquivo "prisma-screen Setup ...exe").
start "" "%~dp0dist"
pause
