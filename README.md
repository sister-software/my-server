# <my-server />

A web app compiler that runs in your browser, and companion to [<my-app />](https://github.com/nirrius/my-app).

⚠️ Here be dragons! This project is a work in progress and is only for the brave. ⚠️

## What's this all about?

When it comes to contemporary web development, tooling is mandatory.
We compile TypeScript and JSX into JavaScript, SCSS into CSS... The list goes on.
But wouldn't it be nice to just start writing code without spending any time getting your machine setup?
My Server has you covered.

## Try it

Start by creating a folder with an `index.html` with the following content:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>

  <body>
    <script src="https://my-server.js.org/server-latest.js"></script>

    <script type="module">
      const myServer = new window.MyServer({
        entry: 'app/main.ts',
        scope: '/',
        workerPath: '/service-worker.js'
      })

      myServer.register()
    </script>
  </body>
</html>
```

Next, we'll need a service worker. In the same folder, create a file named `service-worker.js` with the following content:

```js
self.importScripts('https://my-server.js.org/service-worker-latest.js')
```

Last and certainly not least, a TypeScript file to start your application. Create `main.ts`:

```ts
const greeting: HTMLDivElement = document.createElement('div')

greeting.textContent = 'Hello there!'

document.body.appendChild(greeting)
```

Now open index.html in your browser. You're ready to code!

> During development you'll be able to use service worker through localhost, but to deploy it on a site you'll need to have HTTPS setup on your server.

# TODO

[ ] Much of everything
[ ] Offer premade ZIP with local server script
[ ] TypeScript lib support
[ ] SCSS compilation
[ ] Deploy to Cloudflare Worker
