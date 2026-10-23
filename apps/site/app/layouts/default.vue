<script setup lang="ts">
const context = useEntryContext()
</script>
<template>
  <div class="site-frame">
    <header>
      <NuxtLink
        to="/"
        class="site-title"
        >{{ context?.name || 'ChronoFrame' }}</NuxtLink
      >
      <nav aria-label="Gallery navigation">
        <NuxtLink to="/">Photographs</NuxtLink
        ><NuxtLink to="/albums">Albums</NuxtLink>
      </nav>
    </header>
    <main><slot /></main>
    <footer>
      Made with <a href="https://chronoframe.art/">ChronoFrame</a>
    </footer>
  </div>
</template>
<style>
.site-frame {
  max-width: 1280px;
  margin: auto;
  padding: 24px;
  color: #243128;
  font-family: system-ui, sans-serif;
}
.site-frame header {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
  border-bottom: 1px solid #d9dfd5;
  padding-bottom: 18px;
}
.site-title {
  font-size: 20px;
  font-weight: 650;
  min-width: 0;
  overflow-wrap: anywhere;
}
.site-frame nav {
  display: flex;
  gap: 16px;
  flex-shrink: 0;
  font-size: 14px;
}
.site-frame a {
  color: inherit;
}
.site-frame h1 {
  font-size: 28px;
  font-weight: 500;
  margin-bottom: 24px;
}
.site-frame footer {
  border-top: 1px solid #d9dfd5;
  margin-top: 40px;
  padding-top: 18px;
  font-size: 12px;
  opacity: 0.7;
}
.site-frame input {
  font-size: 16px;
  min-height: 42px;
  padding: 8px;
  border: 1px solid #c5cec0;
  border-radius: 5px;
  max-width: 100%;
}
.site-frame button {
  font: inherit;
}
.site-album-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.site-album-list a {
  display: block;
  padding: 18px;
  border: 1px solid #d9dfd5;
  border-radius: 6px;
  text-decoration: none;
}
.site-unlock {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.site-unlock button {
  padding: 10px 16px;
  background: #344d38;
  color: #fff;
  border: 0;
  border-radius: 5px;
}
@media (max-width: 480px) {
  .site-frame {
    padding: 16px;
  }
  .site-frame header {
    gap: 12px;
  }
  .site-title {
    font-size: 17px;
  }
  .site-frame nav {
    gap: 10px;
    font-size: 12px;
  }
}
@media (prefers-color-scheme: dark) {
  .site-frame {
    color: #d9e1d6;
  }
  .site-frame input {
    background: #202b22;
    color: inherit;
  }
}
</style>
