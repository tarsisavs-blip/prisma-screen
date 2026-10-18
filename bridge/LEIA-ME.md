# prisma-screen (ponte)

Programa do Windows que liga o celular (PWA do Passador) ao Holyrics, sem usar a API do Holyrics:

- **Anterior / Próximo** → a ponte envia ao Holyrics a tecla que você escolher (como o AutoHotkey faz com `ControlSend`).
- **Laser, destaque e tela preta** → a ponte lê a transmissão widescreen do Holyrics e serve um **link novo** com os efeitos desenhados por cima. Abra esse link no navegador ou use como fonte de navegador no OBS.

## Usar

1. Instale e abra **prisma-screen** (ícone na bandeja perto do relógio).
2. **Holyrics (passar slides):** escolha as teclas de avançar e voltar que o seu Holyrics usa e clique em *Testar Avançar/Voltar* com um slide projetado.
   - **Direto na janela** (padrão): não traz o Holyrics para a frente nem mexe nos outros programas. Se o seu Holyrics ignorar a tecla, use o modo abaixo.
   - **Traz o Holyrics por um instante**: ativa o Holyrics, aperta a tecla e devolve o foco à janela anterior (alguns milissegundos).
3. **Saída com efeitos:** cole o link da transmissão do Holyrics (ex.: `http://192.168.1.200:80/view/widescreen`). O programa mostra o link novo (ex.: `http://IP-do-PC:8765/saida`) com botão *Copiar*.
4. No celular, escaneie o QR code da ponte. O app do celular é o mesmo da extensão.

Cada celular fala com um destino por vez (extensão ou ponte): para trocar, escaneie o QR do outro.

## Observações

- O Holyrics precisa estar aberto no mesmo computador da ponte para receber as teclas.
- O link novo repassa o conteúdo do Holyrics pelo computador da ponte, então ele precisa ficar ligado. Há um pequeno atraso na imagem.
- Certificados HTTPS próprios do Holyrics são aceitos automaticamente.
- Opcional: a seção *Laser, destaque e tela preta (sobre o projetor)* ainda desenha os efeitos numa janela sobre um monitor físico.

## Gerar o instalador

```
cd bridge
npm install
npm run dist
```

O instalador sai em `bridge/dist/`.

## API do Holyrics (opcional)

Em *Como enviar*, escolha **Pela API do Holyrics** e preencha endereço, porta (padrão 8091) e token (Holyrics › Arquivo › Configurações › API Server; libere `ActionNext` e `ActionPrevious`). Assim a ponte não mexe em janela nem em foco. A janela de debug mostra cada requisição (`POST /api/ActionNext?token=…`) e a resposta do Holyrics, com o token parcialmente oculto.

## Acesso pela rede

O link de saída escuta em todas as interfaces: outros aparelhos da mesma rede abrem `http://IP-do-PC:8765/saida`. Se não abrir, clique em **Liberar acesso na rede (firewall)**: o Windows pede permissão de administrador e cria uma regra de entrada para a porta (em qualquer tipo de rede, inclusive Pública).
