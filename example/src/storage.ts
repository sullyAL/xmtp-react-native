import ReactNativeBlobUtil from 'react-native-blob-util'

// This contains a naive storage implementation.
// It uses a simple HTTP server to POST and GET files.
// It is not intended for production use, but is useful for testing and development.
// See `dev/local/upload-service`

const useLocalServer = !process.env.REACT_APP_USE_LOCAL_SERVER
const storageUrl = useLocalServer
  ? 'https://localhost'
  : process.env.REACT_APP_STORAGE_URL
const headers = {
  'Content-Type': 'application/octet-stream',
}

export async function uploadFile(
  localFileUri: string,
  fileId: string | undefined
): Promise<string> {
  const url = `${storageUrl}/${fileId}`
  console.log('uploading to', url)
  await ReactNativeBlobUtil.config({
    fileCache: true,
    trusty: useLocalServer,
  }).fetch(
    'POST',
    url,
    headers,
    ReactNativeBlobUtil.wrap(localFileUri.slice('file://'.length))
  )

  return url
}

export async function downloadFile(url: string): Promise<string> {
  console.log('downloading from', url)
  const res = await ReactNativeBlobUtil.config({
    fileCache: true,
    trusty: useLocalServer,
  }).fetch('GET', url)
  return `file://${res.path()}`
}
