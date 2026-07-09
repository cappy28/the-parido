# Le Tableau

Pronostics entre potes, en points virtuels. Crée un groupe (ta classe), tes amis
demandent à rejoindre, tu valides, et tout le monde pronostique avec une cagnotte
commune de points — sans aucun argent réel, sans aucune valeur monétaire.

C'est volontairement conçu comme un jeu à points (façon ligue de pronostics /
fantasy league), pas comme un site de paris avec de l'argent réel : un site de
paris entre particuliers avec de l'argent réel, sans agrément ANJ, est illégal en
France. Cette version-ci n'a pas ce problème.

## Stack

- **Frontend** : HTML/CSS/JS vanilla, aucun framework, aucun build step (`/web`)
- **Backend** : fonctions serverless Vercel (Node.js), routing par fichiers (`/api`)
- **Base de données** : PostgreSQL sur Neon, via Prisma (`/prisma/schema.prisma`)
- **Auth** : JWT (pseudo + mot de passe, bcrypt)

## Comment ça marche

- Chaque **groupe** = une économie de points isolée. Rejoindre 3 groupes te donne
  3 soldes indépendants (1000 points chacun à l'approbation).
- Un **pari** a un titre, 2+ options, et une cagnotte. Chaque mise est débitée
  immédiatement du solde du parieur.
- La résolution suit le principe du **pari mutuel** (comme le tiercé) : à la
  clôture, l'admin déclare l'option gagnante, et chaque gagnant récupère
  `sa_mise × (cagnotte_totale / cagnotte_de_l'option_gagnante)`. Si personne n'a
  misé sur la bonne option, tout le monde est remboursé. C'est déterministe,
  auditable, et ça ne nécessite pas de fixer des cotes à l'avance.
- Un admin peut aussi **fermer** les mises avant résolution, ou **annuler** un
  pari (remboursement intégral).

## Mise en route

```bash
npm install
```

1. Crée un projet sur [neon.tech](https://neon.tech), copie la **pooled connection
   string**, colle-la dans `DATABASE_URL` (voir `.env.example`, à dupliquer en `.env`).
2. Génère un `JWT_SECRET` (ex: `openssl rand -base64 48`).
3. Applique le schéma :
   ```bash
   npx prisma migrate dev --name init
   ```
4. En local avec la CLI Vercel :
   ```bash
   npm i -g vercel
   vercel dev
   ```

## Déploiement (Vercel)

```bash
vercel
```
Puis dans les réglages du projet Vercel → **Environment Variables**, ajoute
`DATABASE_URL` et `JWT_SECRET`. Au premier déploiement, lance la migration contre
la base Neon de prod :
```bash
npx prisma migrate deploy
```

## Structure

```
api/                     fonctions serverless (une route = un fichier)
  auth/register.js
  auth/login.js
  users/me.js
  groups/index.js        GET liste mes groupes · POST créer un groupe
  groups/join.js         POST rejoindre via code d'invitation (→ PENDING)
  groups/[groupId]/
    index.js              GET détail du groupe
    members.js            GET membres (+ demandes en attente si admin)
    members/[userId]/approve.js   POST accepter/refuser
    leaderboard.js
    bets.js                GET liste des paris · POST en créer un
  bets/[betId]/
    wager.js               POST miser des points
    resolve.js             POST déclarer le gagnant (admin)
    status.js               POST fermer / annuler (admin)
lib/                     Prisma client, JWT, contrôle d'accès aux groupes
prisma/schema.prisma
web/                     frontend statique (index / dashboard / group)
```

## Idées pour la suite

- Photo de profil : actuellement un simple lien image — un vrai upload
  (Vercel Blob, Cloudinary...) serait plus confortable que coller une URL.
- Notifications (Discord webhook à la création d'un pari, à sa résolution —
  tu as déjà ce pattern sur d'autres projets).
- Historique des transactions par membre (la table `WalletTransaction` existe
  déjà côté DB, il manque juste l'écran).
- Paris à cotes fixes en option, en plus du pari mutuel.
