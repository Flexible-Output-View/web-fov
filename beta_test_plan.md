# Beta Test Plan - FOV

## 1. Présentation du projet

### Contexte

FOV (Flexible Output View) est une solution technique qui permet aux spectateurs de personnaliser leur expérience de stream en direct. Contrairement aux plateformes de streaming traditionnelles où le spectateur subit la disposition choisie par le streamer, FOV permet de réorganiser les différents éléments visuels et audio selon ses préférences.

### Objectifs

- Permettre aux streamers de diffuser un stream multi-flux (vidéos et audios)
- Permettre aux spectateurs de personnaliser la disposition des flux (position, taille...)
- Permettre aux spectateurs de contrôler le volume de chaque flux audio indépendamment
- Assurer une synchronisation optimale entre les différents flux côté spectateur

### Fonctionnement

Le projet se compose de deux parties principales :

1. **Logiciel de streaming (basé sur OBS)** : Version modifiée d'OBS permettant l'envoi de plusieurs flux vidéo/audio distincts vers le site web
2. **Site web** : Plateforme de streaming avec un lecteur multi-flux personnalisable

Pour cette version bêta, l'objectif principal est de démontrer la capacité à streamer, puis de recevoir deux flux synchronisés, avec la personnalisation du stream côté spectateur.



## 2. Rôles utilisateur

| Rôle | Description |
|------|-------------|
| Streamer | Utilisateur qui diffuse du contenu via notre logiciel. |
| Spectateur | Utilisateur qui regarde un stream sur le site web. Il peut personnaliser la disposition et le volume des flux. |


## 3. Fonctionnalités (Beta)

### Flux utilisateur : Streamer

| ID | Rôle | Fonctionnalité | Description |
|----|------|----------------|-------------|
| S1 | Streamer | Configurer les sources (vidéo et audio) | Ajouter et configurer deux sources distinctes dans le logiciel |
| S2 | Streamer | Lancer un stream multi-flux | Démarrer la diffusion en direct vers le site web |

### Flux utilisateur : Spectateur

| ID | Rôle | Fonctionnalité | Description |
|----|------|----------------|-------------|
| V1 | Spectateur | Accéder au stream | Ouvrir le site web et voir les deux flux vidéo (avec le moins de délai possible entre chaque flux) |
| V2 | Spectateur | Déplacer un flux | Modifier la position d'un flux vidéo sur l'écran |
| V3 | Spectateur | Redimensionner un flux | Modifier la taille d'un flux vidéo depuis le lecteur vidéo |
| V4 | Spectateur | Modifier l'ordre de superposition des flux vidéo | Décider quel flux sera au-dessus d'un autre visuellement |
| V5 | Spectateur | Ajuster le volume | Contrôler le volume de chaque flux audio indépendamment |
| V6 | Spectateur | Masquer/afficher un flux | Cacher ou afficher un flux vidéo |
| V7 | Spectateur | Réinitialiser la disposition | Remettre la disposition par défaut |



## 4. Critères de succès

| ID | Critère de succès | Indicateur/Métrique | Résultat |
|----|-------------------|---------------------|----------|
| S1 | Le streamer peut ajouter et configurer deux sources dans le logiciel | Configuration réussie | Réussi |
| S2 | Les deux flux sont envoyés au site web | 2 flux détectés côté navigateur | En cours |
| V1 | Le spectateur voit les deux flux vidéo sur la page | 2 flux visibles, décalage < 200ms entre les flux | En cours |
| V2 | Le flux peut être déplacé librement sur l'écran | 20 déplacements, 0 échecs | Réussi |
| V3 | Le flux peut être redimensionné en conservant son ratio | 20 redimensionnements, 0 échecs | Réussi |
| V4 | L'ordre de superposition des flux peut être modifié | 20 changements d'ordre, 0 échecs | Réussi |
| V5 | Le volume de chaque flux est ajustable indépendamment | Modification d'un volume sans affecter l'autre | Réussi |
| V6 | Un flux peut être masqué puis réaffiché | 20 essais, 0 échecs | Réussi |
| V7 | La disposition revient à l'état initial | Retour à la disposition de base en 1 clic | Réussi |
