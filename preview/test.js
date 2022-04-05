
// import { createApp } from 'vue'


// console.log(123123, createApp)

import('vconsole').then(res => {
  console.log(res)
})


import('./chunk.js').then(res => {
  console.log('res', res)
})
