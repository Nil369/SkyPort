import React from "react";
import {
  faFilePdf,
  faFileExcel,
  faFileImage,
  faFileArchive,
  faFileVideo,
  faFileAudio,
  faFileWord,
  faFilePowerpoint,
  faDatabase,
  faGear,
  faKey,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { resolveIcon } from "@/lib/icons";

export interface IconConfig {
  icon: React.ReactNode;
  color: string;
}

const EXTENSION_MAP: Record<string, { fa?: any; simple?: string; color: string }> = {
  // Simple Icons (Dev focused)
  js: { simple: "siJavascript", color: "#F7DF1E" },
  jsx: { simple: "siReact", color: "#61DAFB" },
  ts: { simple: "siTypescript", color: "#3178C6" },
  tsx: { simple: "siReact", color: "#61DAFB" },
  py: { simple: "siPython", color: "#3776AB" },
  pyc: { simple: "siPython", color: "#3776AB" },
  pyd: { simple: "siPython", color: "#3776AB" },
  pyo: { simple: "siPython", color: "#3776AB" },
  rb: { simple: "siRuby", color: "#CC342D" },
  php: { simple: "siPhp", color: "#777BB4" },
  go: { simple: "siGo", color: "#00ADD8" },
  java: { simple: "siOpenjdk", color: "#007396" },
  c: { simple: "siC", color: "#A8B9CC" },
  cpp: { simple: "siCplusplus", color: "#00599C" },
  cs: { simple: "siCsharp", color: "#239120" },
  html: { simple: "siHtml5", color: "#E34F26" },
  css: { simple: "siCss3", color: "#1572B6" },
  scss: { simple: "siSass", color: "#CC6699" },
  json: { simple: "siJson", color: "#000000" },
  md: { simple: "siMarkdown", color: "#000000" },
  sql: { simple: "siPostgresql", color: "#4169E1" },
  yaml: { simple: "siYaml", color: "#CB171E" },
  yml: { simple: "siYaml", color: "#CB171E" },
  xml: { simple: "siXml", color: "#FFA500" },
  svg: { simple: "siSvg", color: "#FFB13B" },
  dockerfile: { simple: "siDocker", color: "#2496ED" },
  gitignore: { simple: "siGit", color: "#F05032" },
  gitattributes: { simple: "siGit", color: "#F05032" },
  lock: { simple: "siLock", color: "#FFB13B" },
  env: { fa: faKey, color: "#FFD700" },
  sh: { simple: "siGnubash", color: "#4EAA25" },
  bash: { simple: "siGnubash", color: "#4EAA25" },
  zsh: { simple: "siGnubash", color: "#4EAA25" },
  ps1: { simple: "siPowershell", color: "#5391FE" },
  cmd: { fa: faGear, color: "#808080" },
  bat: { fa: faGear, color: "#808080" },
  
  // FontAwesome (General office/media)
  pdf: { fa: faFilePdf, color: "#E01E22" },
  xlsx: { fa: faFileExcel, color: "#1D6F42" },
  xls: { fa: faFileExcel, color: "#1D6F42" },
  csv: { fa: faFileExcel, color: "#1D6F42" },
  docx: { fa: faFileWord, color: "#2B579A" },
  doc: { fa: faFileWord, color: "#2B579A" },
  pptx: { fa: faFilePowerpoint, color: "#D24726" },
  ppt: { fa: faFilePowerpoint, color: "#D24726" },
  png: { fa: faFileImage, color: "#00BFFF" },
  jpg: { fa: faFileImage, color: "#00BFFF" },
  jpeg: { fa: faFileImage, color: "#00BFFF" },
  gif: { fa: faFileImage, color: "#00BFFF" },
  webp: { fa: faFileImage, color: "#00BFFF" },
  ico: { fa: faFileImage, color: "#00BFFF" },
  mp4: { fa: faFileVideo, color: "#FF4500" },
  mov: { fa: faFileVideo, color: "#FF4500" },
  avi: { fa: faFileVideo, color: "#FF4500" },
  mp3: { fa: faFileAudio, color: "#1DB954" },
  wav: { fa: faFileAudio, color: "#1DB954" },
  zip: { fa: faFileArchive, color: "#FFA500" },
  rar: { fa: faFileArchive, color: "#FFA500" },
  "7z": { fa: faFileArchive, color: "#FFA500" },
  tar: { fa: faFileArchive, color: "#FFA500" },
  gz: { fa: faFileArchive, color: "#FFA500" },
  db: { fa: faDatabase, color: "#4169E1" },
  sqlite: { fa: faDatabase, color: "#4169E1" },
  config: { fa: faGear, color: "#808080" },
  conf: { fa: faGear, color: "#808080" },
  ini: { fa: faGear, color: "#808080" },
};

export function getFileIcon(filename: string): IconConfig {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const config = EXTENSION_MAP[ext];
  if (config?.fa) {
    return {
      icon: <FontAwesomeIcon icon={config.fa} className="size-4 shrink-0" />,
      color: config.color,
    };
  }
  const resolved = resolveIcon(filename);
  return {
    icon: resolved.icon,
    color: resolved.color,
  };
}
