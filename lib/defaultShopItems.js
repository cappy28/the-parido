// Articles de départ pour la boutique d'un groupe. Purement descriptif — c'est
// l'admin qui "honore" une commande manuellement (l'app ne fait qu'enregistrer
// qui a gagné quoi, elle ne branche ces effets sur rien d'automatique).
// Coûts pensés pour un solde de départ de 1000 points.

export const DEFAULT_SHOP_ITEMS = [
  { emoji: '🥐', name: 'Petit-déj offert', description: 'Quelqu\'un du groupe t\'amène le petit-déj la prochaine fois.', cost: 300 },
  { emoji: '🎵', name: 'Maître de la musique', description: 'Tu choisis la musique pendant 1h.', cost: 200 },
  { emoji: '👑', name: 'Champion du Tableau', description: 'Titre honorifique affiché pendant 1 semaine.', cost: 400 },
  { emoji: '🃏', name: 'Immunité sur un gage', description: 'Tu passes ton tour la prochaine fois qu\'un gage tombe sur toi.', cost: 350 },
  { emoji: '🎬', name: 'Choix du programme', description: 'Tu choisis le film/jeu de la prochaine soirée groupe.', cost: 450 },
  { emoji: '🧋', name: 'Boisson offerte', description: 'Une boisson payée par le groupe.', cost: 300 },
  { emoji: '😴', name: 'Excuse de retard validée', description: 'Un retard sans conséquence, une fois.', cost: 250 },
  { emoji: '🎯', name: 'Mise doublée', description: 'Ta prochaine mise compte double si tu gagnes (à valider avec l\'admin).', cost: 600 },
];
