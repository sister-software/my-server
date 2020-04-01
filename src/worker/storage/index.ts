import localForge from 'localforage'

localForge.config({
  driver: localForge.INDEXEDDB,
  name: 'MyServer',
  version: 1
})

export default function getPeristedStorage(): LocalForage {
  return localForge
}
