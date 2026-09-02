# Relais réseau local ShowScore

Ce dossier est autonome et doit être copié au complet dans le dossier personnel Linux du Chromebook de l’annonceur. Il sert l’overlay OBS et les écrans TV sur le réseau local, et conserve le dernier état reçu même si Internet coupe.

## Prérequis

- L’environnement Linux de ChromeOS est activé.
- Node.js `20.19.x` ou `22.13+` et npm sont installés.
- Le port TCP `3000` est transféré dans les paramètres de l’environnement Linux de ChromeOS.

## Installation après transfert

Si l’archive `local-relay.tar.gz` a été placée dans **Téléchargements** sur le Chromebook :

```bash
cd ~
tar -xzf /mnt/chromeos/MyFiles/Downloads/local-relay.tar.gz
cd ~/local-relay
node --version
npm --version
npm ci --omit=dev
chmod +x start-relay.sh
```

L’extraction crée `~/local-relay`; il n’a pas besoin d’exister auparavant.

## Démarrage

### Démarrage simplifié avec l'icône ChromeOS

Installez une seule fois l'application Linux en lui donnant l'adresse IPv4 du Chromebook :

```bash
cd ~/local-relay
./install-launcher.sh 192.168.50.10
```

Une application nommée **ShowScore – Relais local** apparaît ensuite dans le dossier **Applications Linux** du lanceur ChromeOS. Un clic sur l'icône :

1. démarre ou redémarre proprement le relais;
2. le relance automatiquement s'il plante;
3. attend que le port 3000 réponde;
4. ouvre la page d'état du relais dans Chrome.

Il suffit ensuite de cliquer sur **Reconnecter** dans ShowScore. Le terminal n'a pas besoin de rester ouvert. Pour arrêter volontairement le relais, utilisez l'action **Arrêter le relais ShowScore** de l'icône ou exécutez `systemctl --user stop showscore-relay.service`.

L'application, sa configuration et le service persistent après un redémarrage complet du Chromebook. ChromeOS peut laisser l'environnement Linux arrêté au démarrage; dans ce cas, cliquez simplement sur l'icône **ShowScore – Relais local** pour lancer Linux et le relais.

Si le Chromebook reçoit une nouvelle adresse sur un autre routeur, relancez `./install-launcher.sh NOUVELLE_ADRESSE` une fois afin que les liens OBS et TV affichent cette nouvelle adresse.

### Démarrage manuel

Remplacez l’adresse d’exemple par l’adresse IPv4 du Chromebook indiquée dans les détails du réseau ChromeOS :

```bash
cd ~/local-relay
./start-relay.sh 192.168.50.10
```

N’utilisez pas l’adresse Linux `100.115.92.x` affichée par `hostname -I`: elle est interne à Crostini et n’est pas joignable depuis les autres appareils. Utilisez l’adresse Wi-Fi ou Ethernet visible dans les paramètres réseau de ChromeOS.

Le terminal affiche le code de jumelage et les URL à utiliser. Gardez ce terminal ouvert pendant le concours. Arrêtez le relais avec `Ctrl+C`.

Dans ShowScore, utilisez `ws://127.0.0.1:3000/ws/producer`. Dans OBS, utilisez l’URL affichée par le relais, typiquement `http://192.168.50.10:3000/overlay`.

Le dossier `data/` est créé automatiquement au premier démarrage. Il contient le code de jumelage, le dernier état reçu et le cache média local; ne le créez pas manuellement.

## Commanditaires et vidéo MP4 hors ligne

Lorsque le tableau annonceur est connecté, les logos des commanditaires sont intégrés au snapshot local. Ils restent donc affichables si Internet coupe.

Si une vidéo MP4 est configurée pour le manège de compétition, le relais la copie automatiquement dans `data/media/competition-video.mp4`. Attendez que le tableau du relais indique **Vidéo MP4 locale · Prête** avant de couper Internet. La copie n'est refaite que lorsque la vidéo configurée change et elle demeure disponible après un redémarrage du relais.

Ne supprimez pas `data/media/` entre les concours si vous souhaitez conserver la vidéo en cache.
