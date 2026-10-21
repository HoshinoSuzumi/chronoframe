export default eventHandler(async (event) => {
  return (await getUserSession(event)).user
})
