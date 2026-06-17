# SorteioLive 🎲

Sistema de sorteio com verificação de presença para streamers da Twitch.

## Como subir no ar (Vercel - grátis)

1. Crie conta no GitHub: https://github.com/signup
2. Crie conta na Vercel com o GitHub: https://vercel.com/signup
3. Crie um novo repositório no GitHub chamado `sorteio-live`
4. Faça upload de todos esses arquivos (arraste a pasta inteira)
5. Na Vercel, clique em "New Project" → importe o repositório → escolha **Vite** → Deploy

Pronto! Você vai ganhar um link tipo `sorteio-live.vercel.app`

## Como usar na live

1. Abra o painel do Streamer (senha: `streamer123`)
2. Clique em "Abrir live"
3. Poste o link no chat da Twitch
4. Viewers se cadastram e fazem check-in
5. Você adiciona tempo (+15/+30/+60 min) pra quem fica
6. No dia do sorteio, clique em "Sortear" 🎉

## Trocar a senha

No arquivo `src/App.jsx`, linha 5:

```
const PASS = "streamer123"; // TROQUE AQUI
```

## Regras do sorteio

* Mínimo **3 dias** diferentes de presença
* Mínimo **60 minutos** no total (pode ser dividido)
* Sorteio 100% aleatório entre os elegíveis

