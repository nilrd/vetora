# Backend: Vetora

**Não tem backend, e foi de propósito.** Requisito do dono: custo zero de infraestrutura.

- A vetorização roda inteira no navegador (Web Worker). A imagem nunca sai do computador.
- Não há banco de dados, login, pagamento nem e-mail. As preferências ficam no `localStorage` do navegador.
- O site é estático (`dist/`): pode ser hospedado de graça no Vercel, Cloudflare Pages, Netlify ou GitHub Pages.

Se um dia virar produto pago, o replica-backend entra com: login (Supabase Auth), assinatura (Stripe) e, se fizer sentido, uma fila com GPU para uma camada de IA opcional (ver custos em `recon.md`).
