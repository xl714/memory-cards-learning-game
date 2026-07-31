# Idol Memory — NEBULA

Jeu de mémorisation en **PWA vanilla JS** (aucune dépendance) : apprends à associer
les visages et les noms des 7 membres du groupe fictif **NEBULA**, grâce à un
système de **répétition espacée** (méthode Leitner à 3 boîtes).

## Règles du jeu

1. **Écran d'étude** : les 7 membres sont affichés avec leur portrait et leur nom. Mémorise-les, puis appuie sur **Commencer**.
2. **Jeu** : une photo s'affiche — **clique sur le bon nom** parmi les 7 proposés (mélangés à chaque question).
3. Chaque membre voyage entre trois mémoires :
   - 🔴 **Mémoire courte** — erreur : le membre revient très vite (3ᵉ question suivante) ;
   - 🟡 **Mémoire moyenne** — bonne réponse : il revient un peu plus tard ;
   - 🟢 **Mémoire longue** — 3 bonnes réponses d'affilée : il ne revient que rarement, pour contrôle.
4. Une erreur renvoie toujours le membre en mémoire courte (et remet son compteur à zéro).
5. Le **curseur de victoire** montre la progression globale : 100 % = 7 membres × 3 étapes (21 graduations
   sur la barre). Chaque promotion (court → moyen → long) fait monter le curseur avec un « +4,8 % » vert ;
   chaque erreur affiche la perte en rouge et fait redescendre le curseur d'autant.
6. **Victoire** quand les 7 membres sont en mémoire longue — avec tes stats (questions, précision, temps).

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
