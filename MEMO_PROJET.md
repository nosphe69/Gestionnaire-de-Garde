# MÉMO DE PROJET & SYNTHÈSE DÉCISIONNELLE
> **Note à consulter en priorité au début de chaque session pour éviter toute régression ou perte de temps.**

---

## 1. Rôle et Objectifs de l'Application

Le **Gestionnaire de Gardes** est une application web conçue pour le suivi des gardes de nuit du laboratoire / établissement médical :
- **Saisie des gardes par date** : Chaque intervenant (ou l'administrateur) déclare le nombre d'urgences traitées durant sa garde de nuit.
- **Règles des primes d'urgence** :
  - **Seuil 1** : 9 urgences ou plus $\rightarrow$ **30 €** (paramétrable dans l'administration).
  - **Seuil 2** (optionnel) : 12 urgences ou plus $\rightarrow$ **60 €** (paramétrable dans l'administration).
- **Règle absolue pour les plannings** :
  - En semaine : la garde est celle de la nuit.
  - **Dimanches et jours fériés français** : seule la **garde de nuit (19h00 à 07h00)** est prise en compte (la garde de jour 07h00-19h00 est ignorée).
- **Rapports et exports** :
  - Récapitulatif mensuel avec statistiques par jour de la semaine et totaux par intervenant.
  - Génération d'un **export PDF officiel** propre directement dans le navigateur (`jsPDF` + `jspdf-autotable`).
  - Envoi automatisé du bilan mensuel par email (`nodemailer` + `node-cron` le 12 de chaque mois à 00h01) et envoi individuel ou manuel.
- **Sécurité et données** :
  - Authentification locale sécurisée (`bcryptjs`). Administrateur : `jrb`.
  - Déconnexion automatique après 5 minutes d'inactivité.
  - Sauvegarde locale (`.bak`), restauration et téléchargement direct du fichier SQLite `guards.db`.

---

## 2. Synthèse des Erreurs Passées & Décisions Clés (À NE PLUS REPRODUIRE)

### ❌ Erreur n°1 : Tenter d'analyser les plannings PDF avec une IA (Gemini API)
* **Constat** :
  - Quotas rapidement saturés et erreurs 429 fréquentes (`RESOURCE_EXHAUSTED`, `credits are depleted`).
  - Dépendance permanente à une clé API externe et au réseau cloud.
  - Complexité de code, coûts, lenteur du traitement d'images/PDF en base64, et formatage parfois imprévisible.
* **Décision ferme adoptée** :
  - **Zéro IA / Zéro API externe pour les plannings.**
  - L'application créatrice de plannings génère directement une **feuille Excel (.xlsx / .csv)**.
  - Le Gestionnaire de Gardes lit directement ce fichier Excel via la bibliothèque locale `xlsx` (SheetJS) : exécution en **10 millisecondes**, gratuite, 100% hors-ligne, fiable et déterministe.
  - Le filtre dimanches et jours fériés français est appliqué automatiquement sur le créneau de nuit (19h00-07h00).

---

### ❌ Erreur n°2 : Compiler l'application directement sur le NAS Synology (1 Go de RAM)
* **Constat** :
  - Le NAS Synology ne dispose que d'**1 Go de mémoire vive**.
  - Compiler TypeScript (`tsc`), télécharger les devDependencies et exécuter `vite build` sur le NAS saturait la RAM, déclenchait le swap disque intensif et mettait **25 à 30 minutes** (voire plantait par Out-Of-Memory).
* **Décision ferme adoptée** :
  - **Le build frontend (`dist/`) est pré-compilé dans le Cloud (AI Studio / GitHub Actions).**
  - Le dossier `dist/` est conservé dans le dépôt (retiré du `.gitignore`).
  - Le `Dockerfile` pour le NAS est allégé : il installe uniquement les dépendances de production (`npm install --omit=dev`) et copie directement le `dist/` pré-compilé.
  - Le déploiement sur le NAS passe de **30 minutes à moins d'une minute** !

---

## 3. Architecture Technique

* **Serveur & API** : Node.js 20, Express, TypeScript (`server.ts`).
* **Base de données** : SQLite 3 (`better-sqlite3`) située dans `/app/data/guards.db`.
  - `users` : comptes intervenants (nom, login, code unique ex. G001, mot de passe haché, email).
  - `shifts` : gardes déclarées (date unique, nombre d'urgences, montant prime, user_id).
  - `scheduled_duties` : gardes prévues au planning issues de l'Excel ou saisies manuelles (`date`, `note` = intervenant prévu).
  - `settings` : configuration des primes et paramètres SMTP.
  - `additional_emails` : destinataires en copie des bilans.
* **Frontend** : React 19, TypeScript, Tailwind CSS, Lucide Icons, Motion.
* **Traitement Excel** : `xlsx` (SheetJS) côté serveur et client.
* **Exports PDF** : `jspdf` et `jspdf-autotable`.
* **Emails** : `nodemailer` (SMTP standard ou Gmail avec mot de passe d'application).

---

## 4. Procédure de Mise à Jour Rapide sur le NAS Synology

### Méthode Directe (Recommandée - 45 secondes)
Comme les fichiers de production `dist/` sont déjà compilés dans le Cloud :

Connectez-vous en SSH sur le NAS dans le dossier de l'application :
```bash
git pull origin main
docker compose up -d --build
```
> **Pourquoi c'est rapide** : Le NAS ne compile plus le frontend. Il installe seulement les paquets légers de production et démarre le serveur instantanément sans saturer la RAM.

### Méthode GitHub Actions (Image Docker pré-construite)
Le fichier `.github/workflows/docker-publish.yml` compile automatiquement l'image Docker complète sur les serveurs de GitHub. Sur le NAS, il suffit de :
```bash
docker compose pull
docker compose up -d
```
> **Temps d'exécution** : ~10 secondes (simple téléchargement des couches Docker).
