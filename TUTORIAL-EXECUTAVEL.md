# Tutorial: criar ou atualizar o programa do Holyrics (executável)

Para quem não entende de computação. Siga os passos na ordem.

**O que é o "executável"?** É o instalador do programa **prisma-screen** (arquivo `.exe`), que liga o celular ao Holyrics no computador. Sempre que o programa for alterado (por exemplo, quando ganhou o botão de tela preta), é preciso **gerar um instalador novo** e instalá-lo por cima do antigo.

---

## PASSO 1 — Instalar o Node.js (só na primeira vez neste computador)

O Node.js é a ferramenta que monta o instalador. Se você já fez isso antes, pule para o Passo 2.

1. Abra o site **https://nodejs.org**
2. Clique no botão verde grande **"LTS"** (baixa um arquivo).
3. Abra o arquivo baixado e clique em **Next / Avançar** até o fim, deixando tudo como está. Clique em **Install** e depois **Finish**.
4. **Reinicie o computador** (importante).

## PASSO 2 — Gerar o instalador

1. Abra a pasta:
   `D:\PROJETO\PASSADOR DE SLIDE CELULAR\bridge`
2. Dê **dois cliques** no arquivo **`GERAR-INSTALADOR.bat`**.
3. Abrirá uma janela preta com textos passando. **Espere e não feche.** Pode levar de 3 a 10 minutos (na primeira vez demora mais, porque baixa peças da internet).
4. Se, no meio, o Windows perguntar se permite o programa, clique em **Sim / Permitir**.
5. Quando aparecer **"PRONTO!"**, a pasta `dist` abre sozinha. Aperte qualquer tecla para fechar a janela preta.

Dentro da pasta `dist` estará o arquivo:
**`prisma-screen Setup 1.1.0.exe`** ← este é o instalador.

> Se aparecer **[ERRO]** em vermelho/branco: tire uma foto ou print da janela e envie a quem te ajuda. Os erros mais comuns: Node.js não instalado (volte ao Passo 1) ou computador sem internet.

## PASSO 3 — Instalar (ou atualizar) o programa

1. Se o **prisma-screen** estiver aberto, feche-o: clique com o botão direito no ícone dele perto do relógio (canto inferior direito, talvez em "^") e escolha **Sair**.
2. Dê dois cliques em **`prisma-screen Setup 1.1.0.exe`** (na pasta `dist`).
3. Se o Windows mostrar "O Windows protegeu seu PC", clique em **Mais informações** e depois **Executar assim mesmo** (o programa é seu, por isso o aviso aparece).
4. Clique em **Avançar** e depois **Instalar**. Instalar por cima **atualiza** o programa e mantém suas configurações (token do Holyrics, monitor etc.).
5. Abra o **prisma-screen** pelo atalho da Área de Trabalho.

## PASSO 4 — Conferir se deu certo

1. No programa, confira se o endereço, a porta e o token do Holyrics continuam preenchidos e use **Testar Avançar/Voltar**.
2. Marque **Autorizar efeitos neste monitor** (monitor do projetor).
3. No celular, abra o app e toque no **quadrado preto**: a tela do projetor deve ficar toda preta. Toque de novo para voltar.

---

## Resumo rápido (nas próximas vezes)

1. Dois cliques em `bridge\GERAR-INSTALADOR.bat` e esperar o "PRONTO!".
2. Fechar o prisma-screen (botão direito no ícone › Sair).
3. Dois cliques no `.exe` da pasta `dist` › Avançar › Instalar.

## Atenção: o app do celular é separado

O botão novo do celular só aparece depois que o **app do celular (pasta `pwa`) for publicado de novo no Vercel**. Atualizar o executável do computador **não** atualiza o celular. Peça para publicar o `pwa` também. Se o botão não aparecer no celular depois, feche o app e abra de novo (ou recarregue a página).

## Dúvidas comuns

- **"Não acho o `.exe`"**: está dentro de `bridge\dist`. Ignore as outras pastas e arquivos de lá.
- **O programa antigo continua com o comportamento velho**: ele estava aberto durante a instalação. Feche pelo ícone perto do relógio (Sair) e abra de novo.
- **A janela preta fechou sozinha, sem "PRONTO!"**: rode o `.bat` outra vez e fique olhando até o fim; se der erro, envie o print.
