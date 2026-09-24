// The text of the start-up cards (loading, no WebGL, opened from a file, a failed download, a
// crash) in every language the game speaks.
//
// This is a classic script, loaded by index.html before src/boot.js, so that those cards can be
// shown in the player's language even when the game's modules can't load. The string tables in
// strings.js and src/i18n/ take their `boot` section from here, so there is one copy of the text.
globalThis.SubstituteBootStrings = {
  en: {
    loading: 'Chalking up the classroom…',
    loadingDetail: 'Loading the class ({percent}%)',
    loadingSlow: 'This is taking longer than usual. A slow connection can take a minute; it will keep trying.',
    noWebglTitle: 'Your browser can’t show 3D graphics',
    noWebglBody: 'The Substitute needs WebGL, which is turned off or unavailable in this browser. Try a recent version of Chrome, Firefox, Edge or Safari, and make sure hardware acceleration (graphics acceleration) is switched on in your browser settings.',
    fileTitle: 'Open the game through a local web server',
    fileBody: 'Browsers block a game opened straight from a file, so the classroom can’t load this way. In the game’s folder, run the command below, then open http://localhost:8000 in your browser.',
    fileCommand: 'npm start',
    loadFailTitle: 'The classroom couldn’t load',
    loadFailBody: 'Some of the game’s files didn’t arrive. Check your connection and try again.',
    retry: 'Try again',
    crashTitle: 'Something went wrong',
    crashBody: 'The game ran into a problem it can’t recover from. Reloading starts the class again.',
  },
  es: {
    loading: 'Preparando el aula…',
    loadingDetail: 'Cargando la clase ({percent} %)',
    loadingSlow: 'Está tardando más de lo normal. Con una conexión lenta puede tardar un minuto; seguirá intentándolo.',
    noWebglTitle: 'Tu navegador no puede mostrar gráficos 3D',
    noWebglBody: 'El Sustituto necesita WebGL, que está desactivado o no disponible en este navegador. Prueba una versión reciente de Chrome, Firefox, Edge o Safari y comprueba que la aceleración por hardware (aceleración gráfica) esté activada en los ajustes del navegador.',
    fileTitle: 'Abre el juego desde un servidor web local',
    fileBody: 'Los navegadores bloquean un juego abierto directamente desde un archivo, así que el aula no puede cargarse de esta forma. En la carpeta del juego, ejecuta el comando de abajo y abre http://localhost:8000 en el navegador.',
    fileCommand: 'npm start',
    loadFailTitle: 'No se pudo cargar el aula',
    loadFailBody: 'Algunos archivos del juego no llegaron. Comprueba tu conexión e inténtalo de nuevo.',
    retry: 'Reintentar',
    crashTitle: 'Algo ha salido mal',
    crashBody: 'El juego ha tenido un problema del que no puede recuperarse. Al recargar, la clase empieza de nuevo.',
  },
  fr: {
    loading: 'On prépare la salle de classe…',
    loadingDetail: 'Chargement de la classe ({percent} %)',
    loadingSlow: 'Cela prend plus de temps que d’habitude. Avec une connexion lente, comptez une minute ; le chargement continue.',
    noWebglTitle: 'Votre navigateur ne peut pas afficher de 3D',
    noWebglBody: 'Le Remplaçant a besoin de WebGL, qui est désactivé ou indisponible dans ce navigateur. Essayez une version récente de Chrome, Firefox, Edge ou Safari, et vérifiez que l’accélération matérielle (accélération graphique) est activée dans les réglages du navigateur.',
    fileTitle: 'Ouvrez le jeu via un serveur web local',
    fileBody: 'Les navigateurs bloquent un jeu ouvert directement depuis un fichier : la classe ne peut pas se charger ainsi. Dans le dossier du jeu, lancez la commande ci-dessous, puis ouvrez http://localhost:8000 dans votre navigateur.',
    fileCommand: 'npm start',
    loadFailTitle: 'La classe n’a pas pu se charger',
    loadFailBody: 'Certains fichiers du jeu ne sont pas arrivés. Vérifiez votre connexion et réessayez.',
    retry: 'Réessayer',
    crashTitle: 'Un problème est survenu',
    crashBody: 'Le jeu a rencontré un problème dont il ne peut pas se remettre. Recharger la page relance le cours.',
  },
};
