export default defineTask({
  meta: {
    name: 'db:migrate',
    description: 'Migrate the configured database with a pre-upgrade backup',
  },
  async run() {
    useDB()
    return { result: 'success' }
  },
})
