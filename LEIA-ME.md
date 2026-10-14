# prisma-screen (celular → Chrome)

Duas peças:

- `extension/` — extensão do Chrome (instalar no computador).
- `pwa/` — app web do celular (publicar com HTTPS; gratuito no Vercel ou GitHub Pages).

Comunicação: WebRTC direto entre celular e extensão (PeerJS, servidor público gratuito só para o pareamento + STUN gratuito do Google). Na mesma rede Wi-Fi o tráfego não sai dela.

## Instalação

1. **Publicar o PWA**: suba a pasta `pwa/` num hospedamento HTTPS gratuito (o giroscópio só funciona em HTTPS).
2. **Extensão**: Chrome → `chrome://extensions` → Modo do desenvolvedor → *Carregar sem compactação* → escolha a pasta `extension/`.
3. Clique no ícone da extensão › *Configurações* › cole o endereço do PWA. Aparece o **QR code**.
4. No celular, escaneie o QR code (abre o PWA já pareado). Em Android/iOS use *Adicionar à tela inicial*. O pareamento fica salvo.

## Uso

- Abra os slides no Chrome, clique no ícone da extensão › **Autorizar esta aba**. Só essa aba recebe teclas e efeitos (a autorização some se a aba for recarregada, navegar ou fechar).
- **PDF**: o leitor nativo do Chrome bloqueia extensões. Use *Abrir PDF no passador* (visualizador próprio).
- Celular: **◀ ▶** = PgUp/PgDn; **Laser** + cores; **Destaque (fade)** com tamanho do círculo ajustável; movimento por **Giroscópio** ou **Touchpad**; *Centralizar* recalibra.
- *Teclas reais* (Configurações): usa o modo depuração do Chrome para enviar teclas verdadeiras, para sites que ignoram teclas simuladas (o Chrome mostra uma faixa de aviso).
