# prisma-screen (ponte)

Programa do Windows que liga o celular (PWA do Passador) ao Holyrics:

- **Anterior / Próximo** → chamam `ActionPrevious` / `ActionNext` na API do Holyrics.
- **Laser e destaque (fade)** → desenhados numa janela transparente, sem foco e que não captura cliques, sobre o monitor/projetor que você escolher.

## Configurar o Holyrics (uma vez)

1. Holyrics › Arquivo › Configurações › **API Server**: ative o servidor (porta padrão 8091).
2. **Gerenciar permissões › Adicionar**: crie um token e libere `ActionNext` e `ActionPrevious`.

## Usar

1. Instale e abra **prisma-screen** (ícone na bandeja perto do relógio).
2. Preencha endereço, porta e token do Holyrics e use *Testar Próximo/Anterior*.
3. Escolha o monitor do projetor e marque **Autorizar efeitos neste monitor**.
4. No celular, escaneie o QR code da ponte. O app do celular é o mesmo da extensão.

Cada celular fala com um destino por vez (extensão ou ponte): para trocar, escaneie o QR do outro.

## Gerar o instalador

```
cd bridge
npm install
npm run dist
```

O instalador sai em `bridge/dist/`.
