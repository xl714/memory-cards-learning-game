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
3. Chaque membre traverse **trois niveaux de mémoire**, chacun à **compléter** :
   - 🔴 **Mémoire courte** — le membre revient très vite (3ᵉ question suivante) ;
   - 🟡 **Mémoire moyenne** — il revient un peu plus tard ;
   - 🟢 **Mémoire longue** — il ne revient que rarement : ses derniers crans se gagnent
     lors de ces contrôles espacés.
4. La **difficulté** fixe le nombre de bonnes réponses d'affilée pour compléter chaque niveau :
   **facile** 1 (jauge de 3 crans), **moyen** 2 (jauge de 6, défaut), **difficile** 3 (jauge de 9).
5. Une erreur renvoie toujours le membre en mémoire courte (et remet son compteur à zéro).
6. **L'espacement est garanti** : si la file d'attente est trop courte pour offrir l'écart voulu
   (par exemple avec 1 ou 2 membres seulement), des **cartes d'interférence** s'intercalent pour
   occuper la mémoire entre deux passages d'un visage — au choix (⚙) : **calcul mental** ou
   **nom coréen** (un nom s'affiche en hangul, retrouve quel membre s'écrit ainsi). Sans elles,
   impossible de tester une mémoire plus longue que la mémoire courte avec un petit effectif.
   Leurs réponses n'affectent pas les jauges, mais une **pastille de score** (« 🧮 3/4 » ou
   « 한 3/4 ») suit tes réussites, reprise sur l'écran de victoire.
7. Le **curseur de victoire** montre la progression globale : 100 % = nombre de membres × crans de la
   jauge, matérialisés par les graduations de la barre. Chaque cran gagné fait monter le curseur avec
   un gain vert ; chaque erreur affiche la perte en rouge et fait redescendre le curseur d'autant.
8. **Victoire** quand toutes les jauges sont pleines — la mémoire longue de chaque membre doit avoir
   été validée par ses contrôles, pas seulement atteinte. Stats à la clé (questions, précision, temps).

Le bouton **⚙ Réglages** (accueil et jeu) ouvre les options, mémorisées entre les sessions :
- **Difficulté** : facile / moyen / difficile — modifiable même en pleine partie (les séries en cours
  sont conservées, seuls les seuils bougent) ;
- **Cartes intercalées** : **calcul mental** (défaut) ou **nom coréen** en hangul — ce dernier
  renforce l'apprentissage du groupe tout en espaçant les questions ;
- **Affichage du score** : **barre globale** (défaut, graduée + un jeton coloré par membre) ou
  **barres par membre** (une barre verticale par membre, curseur blanc, photo en dessous — le score
  monte image par image, avec badge « +1 » / « −N » à chaque changement).

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
