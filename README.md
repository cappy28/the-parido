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

**Articles par défaut** : tout nouveau groupe démarre avec 8 articles
génériques préremplis (`lib/defaultShopItems.js` — petit-déj offert, choix de
la musique, immunité sur un gage...). Pour un groupe créé avant cette
fonctionnalité, le bouton **"Charger les articles par défaut"** (visible par
l'admin dans l'onglet Boutique) les ajoute rétroactivement, sans dupliquer
ceux déjà présents.

**Photo par article** : comme pour l'avatar, upload réel via Vercel Blob
(recadré en carré + compressé côté navigateur), disponible à la création d'un
article ou ajoutable après coup — l'image remplace l'emoji sur la carte.

## Génération automatique de paris (foot / basket / e-sport)

Un admin de groupe peut suivre une compétition depuis l'onglet **Auto ⚡** :
les échéances à venir (matchs, courses...) deviennent des paris tout seuls, et
les résultats sont appliqués automatiquement à la clôture. Cinq fournisseurs
branchés, derrière une interface commune (`lib/sports/*`) — en ajouter un
nouveau ne touche à rien d'autre :

| Sport | Fournisseur | Clé requise | Plan gratuit |
|---|---|---|---|
| ⚽ Football | [TheSportsDB](https://www.thesportsdb.com) | *aucune* | clé de test publique "123", 30 req/min |
| 🏀 Basketball | [TheSportsDB](https://www.thesportsdb.com) | *aucune* | idem |
| 🏎️ Formule 1 | [Jolpica-F1](https://github.com/jolpica/jolpica-f1) (ex-Ergast) | *aucune* | sans clé, ~200 req/h |
| 🏍️ MotoGP | API non-officielle motogp.com | *aucune* | sans clé, non documenté officiellement |
| 🎮 E-sport | [pandascore.co](https://pandascore.co) | `PANDASCORE_TOKEN` | voir ⚠️ ci-dessous |

**Seul l'e-sport garde encore une clé.** J'ai cherché un équivalent sans clé
pour LoL/CS2/Dota/Valorant en même temps que pour le foot et le basket, et il
n'y en a pas de fiable : soit c'est un vrai fournisseur (comme PandaScore) qui
demande un compte, soit c'est du scraping de sites non officiels (ex: FotMob,
Liquipedia) — j'évite volontairement ce genre de source, à la fois parce que
ça casse sans prévenir et parce que ça met en difficulté les sites visés (voir
par ex. ce qui est arrivé à FBref début 2026 quand Stats Perform leur a coupé
l'accès pour ce genre d'usage). Il existe une API non-officielle de Riot pour
LoL spécifiquement (même logique que l'adaptateur MotoGP : c'est le vrai
backend du site officiel, juste non documenté), mais ça ne couvrirait que LoL,
pas CS2/Dota/Valorant. Dis-moi si tu veux que je l'ajoute quand même en plus
de PandaScore (pas à la place).

**Foot/basket via TheSportsDB — contreparties à connaître** par rapport à
l'ancien api-football/api-basketball : c'est une base communautaire (façon
Wikipedia), donc une petite ligue peut avoir des données manquantes ou en
retard (les grands championnats sont bien couverts). Le plan gratuit limite
aussi certains appels à 3 résultats — l'adaptateur interroge donc jour par
jour pour limiter la perte, mais une ligue qui aligne plus de 3 matchs le même
jour peut en perdre quelques-uns (rare en pratique). Le détail est commenté en
tête de `lib/sports/thesportsdb.js`.

Le formulaire "Suivre une compétition" affiche une indication sous les champs
*Identifiant* et *Saison* qui change selon le fournisseur choisi. Ces
indications viennent de `lib/sports/index.js` (`listProviders()`), donc pas
besoin de maintenir une liste séparée côté frontend.

**F1 et MotoGP n'ont pas encore pu être testés contre les API en direct**
(écrits dans un environnement sans accès réseau sortant) — Jolpica-F1 suit
fidèlement le format Ergast bien établi donc le risque est faible, mais
l'adaptateur MotoGP (API non-officielle et non documentée par Dorna) est plus
fragile. S'il échoue en prod, le message d'erreur exact de `/api/cron/sync-fixtures`
dans les logs Vercel permet de corriger rapidement le champ concerné. Le
nouvel adaptateur TheSportsDB (foot/basket) n'a pas pu être testé en direct
non plus, mais son schéma JSON est stable et documenté depuis des années donc
le risque est faible.

**⚠️ Avant d'activer PandaScore** : leur page tarifs indique explicitement que
le plan gratuit "Schedules, Results & Context Data" est réservé à un usage
non lié aux paris. Le Tableau n'utilise que des points virtuels (pas d'argent
réel), mais je ne peux pas juger à ta place si ton usage rentre dans leurs
conditions — relis leurs CGU actuelles ou contacte leur support avant de
compter dessus sérieusement. Rien d'autre dans le projet ne dépend de ce
fournisseur particulier.

### Trouver l'ID d'une compétition

Le formulaire "Suivre une compétition" demande un `competitionId` — sa
signification dépend du fournisseur (voir l'indication affichée sous le
champ) :
- **Football / Basketball (TheSportsDB)** : id numérique de la ligue — parcours
  [thesportsdb.com/sport/leagues](https://www.thesportsdb.com/sport/leagues),
  clique sur ta ligue, l'id est dans l'URL. Quelques exemples : Ligue 1 = 4334,
  Premier League = 4328, NBA = 4387.
- **PandaScore** : `GET /leagues?search=lol` avec ton token, ou dans leur
  interface.
- **F1** : peu importe, le champ est ignoré (une seule compétition existe).
- **MotoGP** : `motogp`, `moto2`, `moto3` ou `motoe`.

Ce champ n'est volontairement pas pré-rempli avec une liste figée pour les
fournisseurs à ligues multiples : les IDs exacts changent selon les saisons
et je préfère que tu les vérifies toi-même plutôt que de coder en dur des
chiffres qui pourraient être faux.

### Cron

Deux jobs (`vercel.json`) : synchro des échéances à venir le matin, résolution
des échéances terminées le soir. Sur le plan **Hobby** de Vercel, un cron ne peut
tourner qu'1x/jour max — c'est déjà le cas ici, donc ça marche gratuitement.
Passe sur Pro si tu veux du quasi temps-réel. Les deux routes sont protégées
par `CRON_SECRET` (Vercel l'envoie automatiquement). `vercel.json` fixe aussi
`maxDuration: 60` sur ces deux routes (au lieu des 10s par défaut) : la
synchro MotoGP notamment enchaîne plusieurs appels réseau par course
(saison → catégorie → épreuves → sessions → grille des pilotes), et
TheSportsDB interroge désormais jour par jour plutôt qu'en un seul appel —
les deux peuvent prendre plus de temps que l'ancien api-football.

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

### Dépannage

**"Function Runtimes must have a valid version, for example `now-php@1.0.0`"**
— Vercel n'utilise pas `vercel.json` pour choisir la version de Node.js sur
des fonctions Node standard (ce champ `runtime` sert aux runtimes communautaires
type `nom@version`). La version de Node se fixe via `"engines"` dans
`package.json` (déjà fait ici → Node 20). Si l'erreur revient, vérifie qu'aucun
bloc `functions` n'a été rajouté dans `vercel.json`.

## Structure

```
api/                     fonctions serverless — routes CONSOLIDÉES (voir note ci-dessous)
  auth/[action].js         POST /auth/login · POST /auth/register
  users/[action].js        GET /users/me · POST/DELETE /users/avatar
  groups/index.js          GET liste mes groupes · POST créer un groupe
  groups/[...segments].js  TOUT le reste sous /groups/* (voir détail plus bas)
  bets/[betId]/[action].js POST wager · POST resolve · POST status (admin)
  shop/[itemId]/buy.js     POST acheter un article
  purchases/[purchaseId]/fulfill.js   POST honorer / annuler une commande (admin)
  cron/[job].js            GET sync-fixtures · GET resolve-fixtures
lib/
  db.js, auth.js, groupAccess.js, cronAuth.js
  blobImage.js              upload/suppression générique sur Vercel Blob
  defaultShopItems.js        pack d'articles pré-remplis à la création d'un groupe
  betLogic.js              résolution/annulation — utilisé par l'admin ET les crons
  sports/                  un adaptateur par fournisseur + un registre commun
    thesportsdb.js (+ thesportsdbFootball.js, thesportsdbBasketball.js),
    pandascore.js, f1.js, motogp.js, index.js
prisma/schema.prisma
web/                     frontend statique (index / dashboard / group / profile)
```

**Pourquoi `[...segments].js` et pas un fichier par route ?** Le plan Hobby de
Vercel limite un déploiement à 12 fonctions serverless. Avec une route =
un fichier (convention classique), ce projet en dépassait largement le
nombre (25+). Les routes sont donc regroupées par ressource dans des fichiers
catch-all qui font leur propre routage interne selon `req.method` et les
segments d'URL. `api/groups/[...segments].js` à lui seul gère : détail d'un
groupe, rejoindre, paris du groupe, classement, membres (+ validation),
boutique (+ photo, articles par défaut), commandes, compétitions suivies
(+ détail). Le mapping complet des routes est commenté en tête de ce fichier.
`api/groups/index.js` reste séparé car Vercel (hors Next.js) ne supporte que
le catch-all *obligatoire* (`[...x]`, 1 segment ou plus) et pas la variante
*optionnelle* (`[[...x]]`) — il fallait donc un fichier dédié pour la route
exacte `/groups` (0 segment).

Au total : 8 fonctions serverless, largement sous la limite de 12 — de la
marge pour ajouter d'autres fournisseurs sport sans jamais retoucher à ce
découpage.

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
