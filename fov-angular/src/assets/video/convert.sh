#!/bin/bash

INPUT="$1"

if [ -z "$INPUT" ]; then
  echo "❌ Erreur: Aucun fichier MP4 fourni."
  echo "➡️  Usage: ./convert.sh multipiste.mp4"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "❌ Le fichier '$INPUT' n'existe pas."
  exit 1
fi

OUTPUT_DIR="../hls_out"

echo "🧹 Nettoyage du dossier $OUTPUT_DIR..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

echo "🔍 Analyse du fichier avec ffprobe..."

# Compter les pistes vidéo
VIDEO_COUNT=$(ffprobe -v error -select_streams v -show_entries stream=index \
    -of csv=p=0 "$INPUT" | wc -l)

# Compter les pistes audio
AUDIO_COUNT=$(ffprobe -v error -select_streams a -show_entries stream=index \
    -of csv=p=0 "$INPUT" | wc -l)

echo "🎥 Nombre de pistes vidéo détectées : $VIDEO_COUNT"
echo "🔊 Nombre de pistes audio détectées : $AUDIO_COUNT"

if [ "$VIDEO_COUNT" -eq 0 ]; then
  echo "❌ Aucune piste vidéo trouvée."
  exit 1
fi

# Fonction pour obtenir le nom de la piste
get_track_name() {
  local index=$1
  case $index in
    0) echo "first" ;;
    1) echo "second" ;;
    2) echo "third" ;;
    3) echo "fourth" ;;
    *) echo "track$index" ;;
  esac
}

# Extraction et conversion des pistes vidéo avec leur audio correspondant
INDEX=0
while [ $INDEX -lt $VIDEO_COUNT ]
do
  NAME=$(get_track_name $INDEX)
  
  echo "-----------------------------------------------"
  echo "🎬 Traitement de la piste $INDEX → $NAME"
  
  # Vérifier si une piste audio correspondante existe
  HAS_AUDIO="false"
  if [ $INDEX -lt $AUDIO_COUNT ]; then
    HAS_AUDIO="true"
    echo "   📹 Extraction vidéo (stream v:$INDEX) + 🔊 audio (stream a:$INDEX)"
    
    # Créer le HLS avec vidéo ET audio combinés
    echo "📡 Conversion en HLS avec audio intégré ($NAME.m3u8)"
    ffmpeg -y -i "$INPUT" \
      -map 0:v:$INDEX \
      -map 0:a:$INDEX \
      -c:v copy \
      -c:a aac \
      -hls_time 2 \
      -hls_list_size 0 \
      -hls_segment_filename "$OUTPUT_DIR/${NAME}_%03d.ts" \
      -start_number 0 \
      -f hls "$OUTPUT_DIR/${NAME}.m3u8" 2>/dev/null
  else
    echo "   📹 Extraction vidéo seule (stream v:$INDEX) - pas d'audio correspondant"
    
    # Créer le HLS sans audio
    echo "📡 Conversion en HLS sans audio ($NAME.m3u8)"
    ffmpeg -y -i "$INPUT" \
      -map 0:v:$INDEX \
      -c:v copy \
      -an \
      -hls_time 2 \
      -hls_list_size 0 \
      -hls_segment_filename "$OUTPUT_DIR/${NAME}_%03d.ts" \
      -start_number 0 \
      -f hls "$OUTPUT_DIR/${NAME}.m3u8" 2>/dev/null
  fi
  
  # Ajouter au fichier JSON
  COMMA=""
  if [ $INDEX -gt 0 ]; then
    COMMA=","
  fi
  
  echo "$COMMA" >> "$METADATA_FILE"
  echo "    {" >> "$METADATA_FILE"
  echo "      \"index\": $INDEX," >> "$METADATA_FILE"
  echo "      \"name\": \"$NAME\"," >> "$METADATA_FILE"
  echo "      \"videoUrl\": \"${NAME}.m3u8\"," >> "$METADATA_FILE"
  echo "      \"hasAudio\": $HAS_AUDIO" >> "$METADATA_FILE"
  echo "    }" >> "$METADATA_FILE"
  
  INDEX=$((INDEX+1))
done

echo "  ]," >> "$METADATA_FILE"
echo "  \"videoCount\": $VIDEO_COUNT" >> "$METADATA_FILE"
echo "}" >> "$METADATA_FILE"

echo ""
echo "-----------------------------------------------"
echo "✅ Conversion terminée !"
echo "📁 Résultats dans : $OUTPUT_DIR"
echo "📋 Fichier de métadonnées : $METADATA_FILE"
echo ""
echo "Fichiers générés :"
ls -la "$OUTPUT_DIR"/*.m3u8 2>/dev/null
