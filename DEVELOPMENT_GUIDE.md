Call2Eat – Guide Développeur Officiel
🧩 1. Présentation du Projet

Call2Eat est une plateforme permettant aux restaurants de gérer automatiquement les commandes passées par téléphone grâce à une IA.
Elle combine :

Téléphonie Twilio

Parsing IA (DeepSeek ou OpenAI)

Supabase (BDD & auth future)

Dashboard web Next.js

Mode cuisine PWA

Option Premium avec OpenAI Realtime

⚙️ 2. Architecture Technique
Backend — Next.js 16

Endpoints principaux :

/api/voice → point d’entrée Twilio

/api/orders → création commande

/api/orders/status → mise à jour commande

/api/process → tests pipeline

/api/db-check → vérification connexion Supabase

Base de données — Supabase

Tables actuelles :

Table	Description
clients	Informations clients (nom + téléphone)
products	Liste des produits disponibles
orders	Commandes créées
order_items	Détails des articles par commande
voice_orders	Stockage brut des transcriptions si besoin futur
Téléphonie — Twilio

Webhook → /api/voice

Extraction transcriptions via SpeechResult ou Whisper

Parsing IA — DeepSeek / OpenAI

Fichier central : lib/aiOrderParser.ts

Retourne :

{
  phone_number: string;
  client_name: string | null;
  items: { product_id, quantity }[];
  notes: string | null;
  needs_human: boolean;
}

📱 3. Frontend
Dashboard — /dashboard

Liste des commandes

Mise à jour du statut

Notes cuisine

Mode sombre intégré

Mode Cuisine (PWA) — /kitchen

Installable Android / iOS

Icônes 192 / 256 / 384 / 512 px

Tri automatique des commandes

Stable en production

🚀 4. Fonctionnalités Déjà Implémentées

✔ Téléphonie Twilio fonctionnelle

✔ Parser DeepSeek robuste

✔ API Orders stable (vérification produits, prix, clients)

✔ Dashboard opérationnel

✔ Mode Cuisine PWA terminé

✔ Déploiement stable sur Vercel

✔ Migration vers React 19.2.1 + Next.js 16.0.7 (corrige vulnérabilités)

✔ Icônes PWA intégrées

✔ Commandes visibles en temps réel dans /kitchen

🔥 5. Fonctionnalités à Implémenter (Roadmap)
PRIORITÉ 1 — Pipeline IA+ économique

Pipeline complet :

Twilio → Whisper API → DeepSeek → ElevenLabs → Twilio


Objectifs :

réduire coût IA ×5

conserver bonne reconnaissance

maintenir compatibilité API actuelle

PRIORITÉ 2 — Offre PREMIUM avec OpenAI Realtime

Pipeline Premium :

Twilio → OpenAI Realtime → Réponses vocales → Confirmation → Création commande


Points importants :

streaming bidirectionnel

éviter latence

messages structurés

fallback si perte du flux

PRIORITÉ 3 — Améliorations PWA Cuisine

Notifications push

Minuterie par commande

Mode plein écran auto

Optimisation pour tablettes

PRIORITÉ 4 — Analyse avancée

Nouvelle page : /dashboard/analytics

Statistiques :

commandes / jour

revenu total estimé

produits populaires

taux d’erreurs IA

durée moyenne préparation

PRIORITÉ 5 — Sécurité & Scalabilité

Vérification signature Twilio

Rate limiting /api/voice

Cron Supabase pour archive commandes

Tests de charge

🧠 6. Règles de Travail & Contraintes
Ce que l’utilisateur attend du bot développeur :

Réponses rapides, efficaces, sans blabla.

Code complet prêt à coller dans VS Code.

Ne jamais casser le système existant.

Toujours tester mentalement avant d’écrire le code.

Préserver compatibilité Twilio → IA → Supabase.

Ne jamais modifier les tables Supabase sans validation.

Expliquer si une solution est meilleure ou plus rentable.

🏗️ 7. Structure du Projet
/
├── app/
│   ├── api/
│   │   ├── voice/
│   │   ├── orders/
│   │   ├── process/
│   │   ├── db-check/
│   ├── dashboard/
│   ├── kitchen/
│   ├── manifest.ts
│
├── lib/
│   ├── aiOrderParser.ts
│   ├── supabaseAdmin.ts
│   └── supabaseServer.ts
│
├── public/
│   ├── icons/
│   │   ├── icon-192.png
│   │   ├── icon-256.png
│   │   ├── icon-384.png
│   │   ├── icon-512.png
│   └── landing.html
│
├── voice-gateway/
│   └── aiOrderParser.ts
│
└── package.json

👨‍💻 8. Mission de l’Assistant Développeur

Tu dois :

✔ Continuer le développement de Call2Eat
✔ Proposer des améliorations optimales et rentables
✔ Écrire un code clair, robuste et simple
✔ Préserver la stabilité du système
✔ Anticiper les erreurs
✔ Aider l’utilisateur à prendre les meilleures décisions techniques

Tu es l’ingénieur principal du projet.

📎 9. Notes pour futurs développeurs

Le projet doit rester low-cost pour les restaurateurs.

Architecture modulaire pour accueillir plusieurs IA.

Flexibilité : remplacer Twilio ou IA sans réécrire la stack.

Déploiement automatisé sur Vercel (branch → build automatique).

🏁 10. Fin du document

Ce guide doit être lu par tout développeur reprenant le projet.
Il garantit la continuité du développement, le respect de la vision et l’évolution cohérente du système.