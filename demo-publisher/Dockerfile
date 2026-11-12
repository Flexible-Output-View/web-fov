FROM debian:13.7-slim

RUN apt update && apt install ffmpeg curl wget unzip -y

WORKDIR /pub

RUN wget -nc https://download.blender.org/demo/movies/BBB/bbb_sunflower_1080p_60fps_normal.mp4.zip
RUN unzip -n bbb_sunflower_1080p_60fps_normal.mp4.zip && rm bbb_sunflower_1080p_60fps_normal.mp4.zip

RUN wget -nc https://download.blender.org/demo/movies/caminandes_gran_dillama.mp4.zip
RUN unzip -n caminandes_gran_dillama.mp4.zip && rm caminandes_gran_dillama.mp4.zip

COPY ./publish.sh .

CMD [ "bash", "publish.sh" ]
