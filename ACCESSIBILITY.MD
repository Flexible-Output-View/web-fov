# Accessibilité — FOV

Le site **fovapp.live** est conçu pour être accessible au plus grand nombre,
conformément aux recommandations du [RGAA](https://accessibilite.numerique.gouv.fr/)
et des [WCAG 2.1 niveau AA](https://www.w3.org/TR/WCAG21/).

---

## Fonctionnalités d'accessibilité

### Navigation clavier
- L'intégralité du site est utilisable au clavier (`Tab`, `Entrée`, `Échap`, flèches).
- L'ordre de tabulation suit la logique visuelle de chaque page.
- Un indicateur de focus visible (contour bleu) apparaît sur chaque élément interactif.
- Un **lien d'évitement** « Aller au contenu principal » est disponible en haut de page
  (visible au premier appui sur `Tab`).

### Lecteurs d'écran
- La structure des titres (`h1` → `h2` → `h3`) est hiérarchique et cohérente sur chaque page.
- Tous les champs de formulaire possèdent un `<label>` explicite.
- Les images décoratives sont ignorées (`alt=""`, `aria-hidden="true"`).
- Les images informatives disposent d'une alternative textuelle descriptive.
- Les liens externes signalent l'ouverture dans une nouvelle fenêtre.
- Les messages d'erreur et de succès sont annoncés automatiquement (`role="alert"`, `aria-live`).

### Contraste et lisibilité
- Les couleurs de texte respectent un ratio de contraste minimal de **4.5:1** pour le texte
  courant et **3:1** pour le texte de grande taille (critère WCAG AA).
- L'information n'est jamais transmise par la couleur seule (icônes, textes ou motifs
  accompagnent systématiquement les indicateurs colorés).

### Composants interactifs
| Composant | Implémentation |
|---|---|
| **Onglets** (Découvrir, Suivis) | `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, navigation clavier |
| **Carrousel** (Accueil) | `role="region"`, `aria-roledescription="carrousel"`, `aria-live`, diapositives masquées inertes |
| **Chat en direct** | `role="log"`, `aria-live="polite"`, défilement clavier |
| **Lecteur vidéo** | Contrôles clavier natifs, labels sur les curseurs, `aria-valuenow/min/max` |
| **Modales** | `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`, piège de focus |
| **Formulaires** | `aria-invalid`, `aria-describedby`, `aria-busy`, messages d'erreur en `role="alert"` |
| **Boutons toggle** (mot de passe) | `aria-label` descriptif, `aria-expanded` |

### Animations et mouvements
- Le site respecte la préférence système `prefers-reduced-motion` : toutes les animations
  et transitions sont désactivées lorsque l'utilisateur a activé cette option dans son
  système d'exploitation.

### Langue
- La langue principale du document est déclarée (`lang="fr"`).

---

## Technologies utilisées

- **HTML5** sémantique
- **CSS** avec variables de thème (mode sombre / clair)
- **Angular 16+** avec attributs ARIA natifs (`ariaCurrentWhenActive`, etc.)
- **WAI-ARIA 1.2** pour les composants riches (onglets, carrousel, dialogues, logs)

---

## Tester l'accessibilité

Vous pouvez vérifier l'accessibilité du site avec les outils suivants :

- **Navigation clavier** : parcourez le site uniquement avec `Tab`, `Maj+Tab`, `Entrée` et `Échap`.
- **Lecteur d'écran** : [NVDA](https://www.nvaccess.org/) (Windows),
  [VoiceOver](https://support.apple.com/guide/voiceover) (macOS/iOS),
  [TalkBack](https://support.google.com/accessibility/android/answer/6283677) (Android).
- **Contraste** : [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/).
- **Audit automatique** : [axe DevTools](https://www.deque.com/axe/devtools/),
  [Lighthouse](https://developer.chrome.com/docs/lighthouse/overview/) (onglet Accessibilité).

---

## Signaler un problème

Si vous rencontrez une difficulté d'accès à un contenu ou une fonctionnalité,
merci de nous contacter :

- **GitHub** : [github.com/Flexible-Output-View](https://github.com/Flexible-Output-View)

Nous nous engageons à traiter votre retour dans les meilleurs délais.

---

*Dernière mise à jour : octobre 2026*
