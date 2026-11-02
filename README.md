# Manda Chuva BOT

Bot de Discord que dá cor ao nome por botão. Clicou num botão, ganha a cor (uma por vez). Clicou de novo, tira. Também tem o botão "Tirar cor" e o comando `/cor`.

A configuração (cores, textos do embed, botões, respostas) é feita pela **interface web**, que fica em outro repositório: [Interface-Manda-Chuva-Bot](https://github.com/PedroA07/Interface-Manda-Chuva-Bot). Este repositório é só o bot + a API que a interface usa.

```
Interface (GitHub Pages)  ──senha──▶  API deste bot (Render)  ──▶  Discord
https://pedroa07.github.io/...        https://manda-chuva-bot.onrender.com
```

## 1. Criar o bot no Discord

1. Abra https://discord.com/developers/applications → **New Application** → dê o nome (ex.: Manda Chuva).
2. Aba **Bot** → **Reset Token** → copie o token. Guarde: ele é a senha do bot.
3. Na mesma aba, ligue **Server Members Intent** (o painel usa pra contar quem tem cada cor; a portaria e a moderação também vão usar). Sem ela o bot funciona, só sem essas partes: ele avisa no terminal e no painel.

## 2. Testar no seu PC (opcional)

Precisa do Node 22 ou mais novo.

```
copy .env.example .env      (e cole o token em DISCORD_TOKEN)
npm install
npm start
```

Sem `PAINEL_SENHA`, a API só aceita acesso do próprio PC. Abra a interface (veja o LEIA-ME dela) com o endereço `http://localhost:3000`. O link pra adicionar o bot a um servidor aparece no terminal e na interface.

## 3. Subir na Render (grátis)

1. **Gist pra guardar a configuração.** A Render grátis apaga os arquivos sempre que reinicia, então a configuração fica num Gist secreto:
   - Crie em https://gist.github.com um gist **secreto** com um arquivo chamado `paineis.json` contendo `[]`. O ID é o código no fim do endereço (`gist.github.com/PedroA07/` **`este-código`**).
   - Crie um token só com a permissão de gist: [github.com/settings/tokens/new?scopes=gist](https://github.com/settings/tokens/new?scopes=gist&description=Manda-Chuva-BOT). Em "Expiration", escolha o prazo que preferir.
2. **Crie o serviço:** abra https://render.com/deploy?repo=https://github.com/PedroA07/Manda-Chuva-BOT (entre com o GitHub). A Render lê o `render.yaml` e pede:
   - `DISCORD_TOKEN`: o token do passo 1.
   - `PAINEL_SENHA`: uma senha forte, com 12 caracteres ou mais. É ela que a interface vai pedir.
   - `GIST_ID` e `GIST_TOKEN`: do item acima.
3. Espere o deploy terminar e copie o endereço do serviço (algo como `https://manda-chuva-bot.onrender.com`). Abrindo esse endereço no navegador deve aparecer `{"ok":true,"bot":"online"}`.
4. Abra a interface, coloque esse endereço e a senha.

O `render.yaml` já liga o `MANTER_ACORDADO=1`: o bot acessa o próprio endereço a cada 10 min, porque a Render grátis desliga o serviço depois de 15 min sem acesso (e aí o bot sai do Discord). O plano grátis dá 750 horas por mês, o que cobre um serviço ligado o mês todo.

## Variáveis

| Variável | Pra quê |
|---|---|
| `DISCORD_TOKEN` | Token do bot. |
| `PAINEL_SENHA` | Senha da interface (mínimo 12 caracteres). Sem ela, a API só aceita acesso do próprio PC. |
| `PAINEL_ORIGENS` | Sites que podem usar a API, separados por vírgula. Já vem com `https://pedroa07.github.io`. Endereços `localhost` sempre podem. |
| `GIST_ID`, `GIST_TOKEN` | Guardam a configuração num Gist em vez da pasta `dados/`. |
| `MANTER_ACORDADO` | `1` = acessa o próprio endereço a cada 10 min. Usa `URL_PUBLICA` ou, na Render, o `RENDER_EXTERNAL_URL`. |
| `PAINEL_PORTA` | Porta da API no PC (padrão 3000). Na hospedagem vale a `PORT` que ela define. `0` desliga a API. |
| `SO_PAINEL` | `1` = esta cópia só serve a API e não responde aos botões (veja abaixo). |
| `URL_IMAGENS` | Onde ficam os banners da galeria (padrão: o site da interface no GitHub Pages). |
| `DADOS_PASTA` | Pasta da configuração quando não usa Gist (padrão: `dados/`). |

## Bom saber

- Não rode duas cópias normais com o mesmo token ao mesmo tempo, senão as duas respondem aos botões. Se o bot de verdade está na Render e você quer mexer pelo PC, use `SO_PAINEL=1` na cópia do PC.
- O bot **nunca** dá por botão um cargo com permissão de moderação/admin, nem cargo de bot.
- Cada botão guarda o ID do cargo, então painel antigo continua funcionando mesmo se a configuração se perder.
- Depois de salvar, confira o quadro **Hierarquia de cargos** na interface: o cargo do bot precisa ficar acima dos cargos de cor, e os cargos de cor acima dos outros cargos que têm cor.
- O Discord só tem 4 cores de botão (cinza, azul, verde e vermelho). Quem pinta o nome é o cargo. Com "cor do cargo" ou "cor própria", o bot põe uma bolinha da cor no botão (emoji da própria aplicação, não gasta os emojis do servidor) e usa o fundo mais parecido.
- As mensagens usam o layout novo do Discord: banner em cima, caixa colorida, imagens no final e botões. Imagem enviada pelo painel ("Anexar") fica guardada junto da configuração e vai como arquivo na mensagem.
- Degradê no nome precisa de servidor com impulso. Sem isso, o cargo fica com a primeira cor.
- **Portaria:** mensagens quando alguém entra (com um card desenhado pelo bot com a foto e o nome), sai, é expulso, banido ou silenciado. Entrou/saiu precisam da **Server Members Intent**. Expulsão, ban e silêncio vêm do registro de auditoria: o cargo do bot precisa de "Ver o registro de auditoria" (sem ela, expulsão aparece como "saiu"). "Testar comigo" manda a mensagem na DM de quem é dono do bot.
- **Temas de datas festivas:** em cada data (Natal, Ano Novo, Carnaval, Páscoa...) o bot troca banner, miniatura, cor e põe a frase do tema nas mensagens marcadas em "Usar em". Quando dois temas caem no mesmo dia, ganha o de período menor. Carnaval e Páscoa são calculados todo ano. O dia é contado no horário de Brasília (`FUSO` troca). A cada 30 min o bot confere a data e atualiza os painéis já enviados.
- Banners "Eventos" da galeria: o bot desenha a placa com o nome do seu servidor (rota pública `/placas/<evento>.jpg`).
- **Jornal do Campus:** a cada versão nova, o bot posta a notícia no canal escolhido na aba Notícias do painel (desligado até você escolher o canal). Na primeira vez ele posta só a mais recente. Pra mencionar @everyone, o cargo do bot precisa da permissão "Mencionar @everyone".
- `#000000` no Discord é "sem cor". Pra preto use `#010101`.
- Limites do Discord: até 24 cores, 40 peças e 4000 letras por mensagem (o painel avisa antes de salvar).
- Testes: `npm test`.
- Na Render grátis, o primeiro acesso depois de um tempo parado pode demorar cerca de 1 minuto.
