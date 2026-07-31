// Groupe fictif « NEBULA » — membres de démo.
// Les UUID sont fixes : api.images.cat renvoie toujours la même image pour un même UUID.
// `hangul` : le nom écrit en coréen, utilisé par les cartes intercalées « nom coréen » ;
// `romaja` : sa romanisation, affichée en italique à la révélation de la réponse.
// TOUT le jeu s'adapte dynamiquement à cette liste (curseur, graduations, jetons, textes) :
// ajouter ou retirer un membre ici suffit.
const GROUP = {
  name: 'NEBULA',
  members: [
    { id: 'yuna', name: 'Yuna', hangul: '유나', romaja: 'yu-na', img: 'https://api.images.cat/300/300/ed2715bf-7023-4c57-94fb-6b00ecb63f6f' },
    { id: 'miso', name: 'Miso', hangul: '미소', romaja: 'mi-so', img: 'https://api.images.cat/300/300/3a9c41d2-88e1-4f5a-9b27-c15d3e6a7f01' },
    // Membres en réserve — décommenter pour les remettre en jeu :
    // { id: 'haru',  name: 'Haru',  hangul: '하루', romaja: 'ha-ru', img: 'https://api.images.cat/300/300/7be24c93-1f6d-4a08-b3e5-92d47c8a1b02' },
    // { id: 'sena',  name: 'Sena',  hangul: '세나', romaja: 'se-na', img: 'https://api.images.cat/300/300/c4d81f57-6a2b-4e93-8c01-5f7e9b3d2a03' },
    // { id: 'jiwoo', name: 'Jiwoo', hangul: '지우', romaja: 'ji-u', img: 'https://api.images.cat/300/300/19f6e3a8-4d5c-4b72-a680-e2c91d7f4b04' },
    // { id: 'aera',  name: 'Aera',  hangul: '애라', romaja: 'ae-ra', img: 'https://api.images.cat/300/300/85b2d9c1-7e34-4f16-9a58-1c6f0e8d3a05' },
    // { id: 'dain',  name: 'Dain',  hangul: '다인', romaja: 'da-in', img: 'https://api.images.cat/300/300/f03a7e64-2c91-4d58-b716-84e5d2c9fb06' },
  ],
};

if (typeof module !== 'undefined') module.exports = { GROUP };
