#!/usr/bin/env node
// Sends one test push to every device of one user, with the same payload shape as
// services/notify.js, then waits for Expo's receipts and prints what happened.
// Prints counts and statuses only: never tokens, never the address.
//
//   MONGO_URI=… node scripts/sendTestPush.js <email> [options]
//
//   --url=/post/<id>    where tapping it goes (default /notifications); /post/<id> and
//                       /profile/<id> are the screens the app opens from a push
//   --type=<type>       data.type (default "test"; post_liked, connection_request, … also
//                       refresh what the app shows for that type)
//   --body="…"          the text (default "Test notification from MeetNet 👋")
//   --dry               look the user up and count devices, send nothing
//
// Uses EXPO_ACCESS_TOKEN when set (only needed with Expo's enhanced push security).

const mongoose = require('mongoose')
const { Expo } = require('expo-server-sdk')
const User = require('../models/User')
const { redactPushTokens } = require('../utils/redact')

const RECEIPT_WAIT_MS = 10_000

function parseArgs(argv) {
  const opts = { email: '', url: '/notifications', type: 'test', body: 'Test notification from MeetNet 👋', dry: false }
  for (const arg of argv) {
    if (arg === '--dry') opts.dry = true
    else if (arg.startsWith('--url=')) opts.url = arg.slice(6)
    else if (arg.startsWith('--type=')) opts.type = arg.slice(7)
    else if (arg.startsWith('--body=')) opts.body = arg.slice(7)
    else if (!arg.startsWith('--')) opts.email = arg.trim().toLowerCase()
    else throw new Error(`Unknown option ${arg}`)
  }
  if (!opts.email) throw new Error('Usage: node scripts/sendTestPush.js <email> [--url=/post/<id>] [--type=…] [--body=…] [--dry]')
  if (!/^\/(post|profile)\/[A-Za-z0-9_-]+$|^\/notifications$/.test(opts.url)) {
    throw new Error('--url must be /post/<id>, /profile/<id> or /notifications')
  }
  return opts
}

const count = (items, key) => items.reduce((acc, item) => {
  const k = key(item)
  acc[k] = (acc[k] || 0) + 1
  return acc
}, {})

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set')

  await mongoose.connect(process.env.MONGO_URI)
  const user = await User.findOne({ email: opts.email }).select('+pushTokens').lean()
  if (!user) {
    console.log('No user with that email.')
    return
  }

  const devices = (user.pushTokens || []).filter(t => Expo.isExpoPushToken(t.token))
  console.log(`User found. Devices with a push token: ${devices.length}`, devices.length ? count(devices, d => d.platform || '?') : '')
  if (!devices.length) {
    console.log('Nothing to send: open the app on the phone, sign in and allow notifications first.')
    return
  }
  if (opts.dry) return

  const postId = opts.url.startsWith('/post/') ? opts.url.slice(6) : null
  const senderId = opts.url.startsWith('/profile/') ? opts.url.slice(9) : null
  const data = { type: opts.type, postId, senderId, url: opts.url }
  const expo = new Expo(process.env.EXPO_ACCESS_TOKEN ? { accessToken: process.env.EXPO_ACCESS_TOKEN } : {})
  const messages = devices.map(d => ({ to: d.token, sound: 'default', title: 'MeetNet', body: opts.body, data }))

  const tickets = []
  for (const chunk of expo.chunkPushNotifications(messages)) {
    tickets.push(...await expo.sendPushNotificationsAsync(chunk))
  }
  console.log('Tickets:', count(tickets, t => t.status === 'ok' ? 'ok' : `error ${redactPushTokens(t.details?.error || t.message)}`))

  const ids = tickets.filter(t => t.status === 'ok' && t.id).map(t => t.id)
  if (!ids.length) return
  console.log(`Waiting ${RECEIPT_WAIT_MS / 1000} s for delivery receipts…`)
  await new Promise(resolve => setTimeout(resolve, RECEIPT_WAIT_MS))
  const receipts = {}
  for (const chunk of expo.chunkPushNotificationReceiptIds(ids)) {
    Object.assign(receipts, await expo.getPushNotificationReceiptsAsync(chunk))
  }
  const list = Object.values(receipts)
  console.log('Receipts:', list.length
    ? count(list, r => r.status === 'ok' ? 'ok (handed to FCM/APNs)' : `error ${redactPushTokens(r.details?.error || r.message)}`)
    : 'not ready yet (try again in a minute; a ticket "ok" already means Expo accepted it)')
}

main()
  .catch(err => {
    console.error(redactPushTokens(err.message))
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
