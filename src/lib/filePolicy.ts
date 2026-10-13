export const ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif,.pdf,.docx,.xlsx,.pptx,.rtf,.odt,.ods,.odp,.mp3,.wav,.m4a,.ogg,.aac,.flac,.mp4,.mov,.webm,.ipynb,.py,.txt,.md,.csv,.tsv,.json,.xml,.yaml,.yml,.ts,.tsx,.js,.jsx,.html,.css,.sql,.log,.rst,.srt";
export const CLOUD_FILE_ACCEPT = ATTACHMENT_ACCEPT;
export function isCloudTextFile(name: string): boolean {
  return /\.(pdf|docx|xlsx|pptx|ipynb|py|txt|md|csv|json)$/i.test(name);
}
