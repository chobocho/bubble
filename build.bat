@echo off
rem 단일 index.html 릴리스 빌드 스크립트 (build.sh 의 Windows 버전)
setlocal
cd /d "%~dp0"

if not exist node_modules (
  call npm ci || goto :fail
)

call npm run typecheck || goto :fail
call npm test || goto :fail
call npm run build || goto :fail
call npm run verify:release || goto :fail

echo OK: release/index.html
endlocal
exit /b 0

:fail
echo 빌드 실패
endlocal
exit /b 1
