import { createApp } from 'vue';
import App from './App.vue';

// (Optional) Import your own global CSS
// If you choose to create a global CSS file, you can import it here
// import './assets/styles.css'; 

const app = createApp(App);

// Remove PrimeVue usage
// app.use(PrimeVue);

app.mount('#app');