<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
const props=defineProps({phase:{type:Number,default:0}});
function preference(){try{return JSON.parse(localStorage.getItem('echo.music')||'{}')}catch{return {}}}
const saved=preference(),enabled=ref(saved.enabled===true),volume=ref(Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):.2),playing=ref(false),status=ref('点击开启音乐');
const audio=new Audio();audio.loop=true;audio.preload='none';audio.volume=volume.value;
let generation=0,disposed=false;
const track=computed(()=>props.phase===4?'vote':props.phase===2||props.phase===3?'investigation':'reading');
function persist(){try{localStorage.setItem('echo.music',JSON.stringify({enabled:enabled.value,volume:volume.value}))}catch{}}
async function play(){if(disposed||!enabled.value||document.hidden)return;status.value='音乐载入中';try{await audio.play();playing.value=!audio.paused;status.value=playing.value?'音乐播放中':'点击继续音乐'}catch{playing.value=false;status.value='点击继续音乐'}}
function toggle(){enabled.value=!enabled.value;persist();if(enabled.value){if(!audio.src)audio.src=`/assets/music/${track.value}.mp3`;play()}else{generation++;audio.pause();playing.value=false;status.value='音乐已关闭'}}
async function switchTrack(){const id=++generation;if(!audio.src||!enabled.value){if(audio.src)audio.removeAttribute('src');return}const from=audio.volume;
 for(let i=5;i>=0;i--){await new Promise(r=>setTimeout(r,45));if(id!==generation||disposed)return;audio.volume=from*i/5}
 audio.pause();audio.src=`/assets/music/${track.value}.mp3`;audio.volume=volume.value;if(id===generation)play();}
function visibility(){if(document.hidden){audio.pause();playing.value=false}else if(enabled.value)play()}
watch(track,switchTrack);watch(volume,()=>{audio.volume=volume.value;persist()});
audio.addEventListener('pause',()=>playing.value=false);audio.addEventListener('playing',()=>{playing.value=true;status.value='音乐播放中'});audio.addEventListener('error',()=>{playing.value=false;status.value='音乐暂不可用，点击重试'});
onMounted(()=>{document.addEventListener('visibilitychange',visibility);if(enabled.value)status.value='点击继续音乐'});
function resume(){if(!enabled.value)toggle();else{audio.src ||= `/assets/music/${track.value}.mp3`;play()}}
onBeforeUnmount(()=>{disposed=true;generation++;audio.pause();audio.removeAttribute('src');document.removeEventListener('visibilitychange',visibility)});
</script>
<template><aside class="music" aria-label="背景音乐"><button @click="enabled&&!playing?resume():toggle()" :aria-pressed="playing" :title="status">{{playing?'Ⅱ':'♫'}} <span>{{playing?'音乐已开启':enabled?'继续音乐':'开启音乐'}}</span></button><label class="volume">音量 <input aria-label="音乐音量" type="range" min="0" max="1" step="0.05" v-model.number="volume"></label><span class="sr-only" role="status">{{status}}</span></aside></template>
