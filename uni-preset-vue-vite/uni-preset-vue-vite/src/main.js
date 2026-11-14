import {
	createSSRApp
} from "vue";
import App from "./App.vue";
import { registerServiceWorker } from "./lib/pwa.js";

registerServiceWorker();

export function createApp() {
	const app = createSSRApp(App);
	return {
		app,
	};
}
