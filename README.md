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

## Photo de profil

Upload réel (pas un lien à coller) via **Vercel Blob**. Le fichier est
recadré en carré et compressé côté navigateur (canvas) avant l'envoi, donc ça
reste petit et rapide même avec une photo de 12 Mo prise au téléphone.

Mise en route : dashboard Vercel → ton projet → **Storage** → *Create Database*
→ **Blob**. Ça ajoute automatiquement `BLOB_READ_WRITE_TOKEN` aux variables
d'environnement du projet. En local, récupère-la avec `vercel env pull`.

## Boutique

Chaque groupe a sa propre boutique (onglet **Boutique 🛍️**) : l'admin définit
librement les articles — pas de catalogue imposé, ça peut être cosmétique
("badge doré sur le classement") ou réel ("amène les croissants la prochaine
fois"), avec un coût en points et un stock optionnel. Un membre achète, ça
débite son solde immédiatement ; l'admin voit les commandes en attente et les
marque *honorées* (ou les annule — remboursement + restock automatiques).
Comme pour les paris, ça ne touche jamais à de l'argent réel — la
"livraison" d'un article réel reste une affaire entre vous, l'app se contente
de trackear qui a gagné quoi.

## Génération automatique de paris (foot / basket / e-sport)

Un admin de groupe peut suivre une compétition depuis l'onglet **Auto ⚡** :
les matchs à venir deviennent des paris tout seuls, et les résultats sont
appliqués automatiquement à la clôture. Trois fournisseurs branchés, derrière
une interface commune (`lib/sports/*`) — en ajouter un nouveau ne touche à
rien d'autre :

| Sport | Fournisseur | Variable d'env | Plan gratuit |
|---|---|---|---|
| ⚽ Football | [api-football.com](https://www.api-football.com) | `API_FOOTBALL_KEY` | 100 req/jour |
| 🏀 Basketball | [api-basketball.com](https://www.api-basketball.com) | `API_BASKETBALL_KEY` | 100 req/jour |
| 🎮 E-sport | [pandascore.co](https://pandascore.co) | `PANDASCORE_TOKEN` | voir ⚠️ ci-dessous |

**⚠️ Avant d'activer PandaScore** : leur page tarifs indique explicitement que
le plan gratuit "Schedules, Results & Context Data" est réservé à un usage
non lié aux paris. Le Tableau n'utilise que des points virtuels (pas d'argent
réel), mais je ne peux pas juger à ta place si ton usage rentre dans leurs
conditions — relis leurs CGU actuelles ou contacte leur support avant de
compter dessus sérieusement. Rien d'autre dans le projet ne dépend de ce
fournisseur particulier.

### Trouver l'ID d'une compétition

Le formulaire "Suivre une compétition" demande un `competitionId` — c'est un
identifiant numérique propre à chaque fournisseur, pas le nom de la ligue.
Pour le trouver :
- **api-football / api-basketball** : `GET /leagues?search=ligue1` (ou le nom
  de ta ligue) avec ta clé, ou cherche directement sur leur dashboard.
- **PandaScore** : `GET /leagues?search=lol` avec ton token, ou dans leur
  interface.

Ce champ n'est volontairement pas pré-rempli avec une liste figée : les IDs
exacts changent selon les saisons et je préfère que tu les vérifies toi-même
plutôt que de coder en dur des chiffres qui pourraient être faux.

### Cron

Deux jobs (`vercel.json`) : synchro des matchs à venir le matin, résolution
des matchs terminés le soir. Sur le plan **Hobby** de Vercel, un cron ne peut
tourner qu'1x/jour max — c'est déjà le cas ici, donc ça marche gratuitement.
Passe sur Pro si tu veux du quasi temps-réel. Les deux routes sont protégées
par `CRON_SECRET` (Vercel l'envoie automatiquement).

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
  auth/register.js        POST — accepte aussi avatarBase64 (optionnel)
  auth/login.js
  users/me.js              GET profil + mes groupes
  users/avatar.js          POST changer la photo · DELETE la retirer
  groups/index.js        GET liste mes groupes · POST créer un groupe
  groups/join.js         POST rejoindre via code d'invitation (→ PENDING)
  groups/[groupId]/
    index.js              GET détail du groupe
    members.js            GET membres (+ demandes en attente si admin)
    members/[userId]/approve.js   POST accepter/refuser
    leaderboard.js
    bets.js                GET liste des paris · POST en créer un
    shop.js                 GET catalogue · POST ajouter un article (admin)
    shop/[itemId].js         PATCH modifier/activer · DELETE (admin)
    purchases.js             GET historique des commandes
    competitions.js        GET/POST compétitions suivies (auto)
    competitions/[competitionId].js   PATCH activer/couper · DELETE retirer
  bets/[betId]/
    wager.js               POST miser des points
    resolve.js             POST déclarer le gagnant (admin)
    status.js               POST fermer / annuler (admin)
  shop/[itemId]/buy.js     POST acheter un article
  purchases/[purchaseId]/fulfill.js   POST honorer / annuler une commande (admin)
  cron/
    sync-fixtures.js        crée les paris pour les matchs à venir
    resolve-fixtures.js     résout les paris dont le match est terminé
lib/
  db.js, auth.js, groupAccess.js, cronAuth.js
  avatarUpload.js           upload/suppression sur Vercel Blob
  betLogic.js              résolution/annulation — utilisé par l'admin ET les crons
  sports/                  un adaptateur par fournisseur + un registre commun
    apiFootball.js, apiBasketball.js, pandascore.js, index.js
prisma/schema.prisma
web/                     frontend statique (index / dashboard / group / profile)
```

## Idées pour la suite

- Notifications (Discord webhook à la création d'un pari, à sa résolution, ou
  à une nouvelle commande boutique — tu as déjà ce pattern sur d'autres projets).
- Historique des transactions par membre (la table `WalletTransaction` existe
  déjà côté DB, il manque juste l'écran).
- Paris à cotes fixes en option, en plus du pari mutuel.
- Un vrai sélecteur de compétitions (au lieu de taper l'ID à la main), en
  appelant `/leagues?search=` à la volée depuis le formulaire admin.
- Badges/titres cosmétiques débloqués via la boutique et affichés sur le
  classement (le champ `emoji` de `ShopItem` s'y prête bien).
