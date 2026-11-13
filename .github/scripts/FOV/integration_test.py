#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.request
from typing import Any, Dict, List, Optional, TypedDict, Union

API_URL: str = "http://localhost:4000/api/streams/available"
STREAM_NAME: str = "TestIntegration"
MAX_RETRIES: int = 180
INTERVAL: float = 1.0


class Track(TypedDict):
  trackId: str
  name: str
  videoUrl: str
  isVideo: bool
  isAudio: bool


class Stream(TypedDict):
  streamId: str
  trackCount: int
  tracks: List[Track]
  title: str
  description: str
  visibility: str
  category: str
  viewers: int
  streamer: str
  streamerUsername: Optional[str]
  avatarUrl: str
  thumbnailUrl: str


ApiResponse = List[Stream]

def tail_log(filename: str = "obs-stdout.log", lines: int = 50) -> None:
  """Prints the last N lines of the log file for debugging."""

  if os.path.exists(filename):
    print(f"=== Last {lines} lines of {filename} ===")
    try:
      with open(filename, "r", encoding="utf-8", errors="ignore") as f:
        all_lines = f.readlines()
        for line in all_lines[-lines:]:
          print(line, end="")
    except Exception as e:
      print(f"Could not read {filename}: {e}")
  else:
    print(f"Log file {filename} not found.")


def main() -> None:
  print(
      f"Waiting for stream '{STREAM_NAME}' with 2 video and 2 audio tracks in"
      f" {API_URL}..."
  )

  last_response: Optional[ApiResponse] = None

  for count in range(MAX_RETRIES + 1):
    try:
      req = urllib.request.Request(
          API_URL, headers={"Accept": "application/json"}
      )
      with urllib.request.urlopen(req, timeout=5) as response:
        body: str = response.read().decode("utf-8")
        parsed_json: Any = json.loads(body)

        # Ensure it matches the expected list structure at runtime
        if isinstance(parsed_json, list):
          last_response = parsed_json  # type: ignore
        else:
          last_response = None

    except Exception:
      last_response = None

    # Calculate total streams and find our target stream
    stream_count: int = len(last_response) if last_response else 0
    target_stream: Optional[Stream] = None

    if last_response:
      for stream in last_response:
        if stream.get("streamId") == STREAM_NAME:
          target_stream = stream
          break

    # Count tracks for the target stream
    video_count: int = 0
    audio_count: int = 0
    if target_stream and "tracks" in target_stream:
      video_count = sum(
          1 for t in target_stream["tracks"] if t.get("isVideo") is True
      )
      audio_count = sum(
          1 for t in target_stream["tracks"] if t.get("isAudio") is True
      )

    target_found: bool = target_stream is not None

    if count % 5 == 0 or stream_count > 0:
      print(
          f"[{count}/{MAX_RETRIES}s] Total Streams: {stream_count} | Target"
          f" '{STREAM_NAME}' Found: {int(target_found)} | Video Tracks:"
          f" {video_count} | Audio Tracks: {audio_count}"
      )

      # Print partial payload if target stream exists but tracks aren't ready
      if target_found and (video_count != 2 or audio_count != 2):
        print(f"Current API Payload for '{STREAM_NAME}':")
        print(json.dumps(target_stream, indent=2))

    # Check target success condition
    if target_found and video_count == 2 and audio_count == 2:
      print(
          f"Stream '{STREAM_NAME}' successfully verified with 2 video and 2"
          " audio tracks!"
      )
      print("Final API Payload:")
      print(json.dumps(last_response, indent=2))
      sys.exit(0)

    if count < MAX_RETRIES:
      time.sleep(INTERVAL)

  # Timeout reached
  print(
      f"ERROR: Stream '{STREAM_NAME}' with required tracks was not detected"
      f" after {MAX_RETRIES} seconds."
  )

  print("Last raw API response:")
  if last_response is not None:
    print(json.dumps(last_response, indent=2))
  else:
    print("No response or invalid JSON")

  tail_log("obs-stdout.log", 50)
  sys.exit(1)


if __name__ == "__main__":
  main()
