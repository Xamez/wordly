<script lang="ts">
	import Toast from '$lib/components/Toast.svelte';
	import '../app.css';
	let { children } = $props();
</script>

<Toast />

{@render children()}
