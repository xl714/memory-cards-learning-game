# Idol Memory — NEBULA

Jeu de mémorisation en **PWA vanilla JS** (aucune dépendance) : apprends à associer
les visages et les noms des membres du groupe fictif **NEBULA**, grâce à un
système de **répétition espacée** (méthode Leitner à 3 boîtes).

L'effectif est **entièrement dynamique** : la liste des membres vit dans `js/data.js`
(4 membres en démo, 3 autres en réserve commentés) — curseur, graduations, jetons et
textes s'adaptent automatiquement quand on en ajoute ou retire.

## Règles du jeu

1. **Écran d'étude** : tous les membres sont affichés avec leur portrait et leur nom. Mémorise-les, puis appuie sur **Commencer**.
2. **Jeu** : une photo s'affiche — **clique sur le bon nom** parmi ceux proposés (mélangés à chaque question).
3. Chaque membre voyage entre trois mémoires :
   - 🔴 **Mémoire courte** — erreur : le membre revient très vite (3ᵉ question suivante) ;
   - 🟡 **Mémoire moyenne** — bonne réponse : il revient un peu plus tard ;
   - 🟢 **Mémoire longue** — 3 bonnes réponses d'affilée : il ne revient que rarement, pour contrôle.
4. Une erreur renvoie toujours le membre en mémoire courte (et remet son compteur à zéro).
5. Le **curseur de victoire** montre la progression globale : 100 % = nombre de membres × 3 étapes,
   matérialisées par les graduations de la barre (12 pour la démo à 4 membres). Chaque promotion
   (court → moyen → long) fait monter le curseur avec un gain vert (« +8,3 % » à 4 membres) ;
   chaque erreur affiche la perte en rouge et fait redescendre le curseur d'autant.
6. **Victoire** quand tous les membres sont en mémoire longue — avec tes stats (questions, précision, temps).

Le bouton **⚙ Réglages** (accueil et jeu) permet de choisir l'affichage du score, mémorisé entre les sessions :
- **Barre globale** (défaut) : la barre graduée unique + un jeton coloré par membre ;
- **Barres par membre** : une barre verticale par membre (3 crans, curseur blanc, couleur de la mémoire
  atteinte) avec sa photo en dessous — le score monte image par image.

La partie est sauvegardée automatiquement (localStorage) : tu peux fermer l'app et reprendre plus tard.

## Lancer le jeu

C'est un site statique — n'importe quel serveur fait l'affaire :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## PWA

- Installable (manifest + icônes) ;
- Fonctionne **hors ligne** après le premier chargement (service worker : app shell en
  cache-first, portraits en stale-while-revalidate) ;
- Si une image ne charge pas, un avatar de secours (initiale colorée) prend le relais.

## Structure

```
index.html      Les 3 écrans (étude / jeu / victoire)
css/style.css   Styles, animations OK/KO, responsive mobile-first
js/data.js      Les 7 membres (noms + portraits fixes via api.images.cat)
js/memory.js    Moteur de répétition espacée (logique pure, testable sous node)
js/app.js       Orchestration UI, feedback, persistance
manifest.json   Manifest PWA
sw.js           Service worker
icons/          Icônes de l'app
```

## Tester le moteur

```bash
node tests/memory.test.js
```
