First, install EJS:

Using the package manager npm:

npm install ejs

Or using the package manager yarn:

yarn add ejs

In Express v4, a very basic setup using EJS would look like the following. (This assumes a views directory containing an index.ejs page.)

<html>
   <body>
      Hello <%= foo %>
   </body>
</html>

let express = require('express');
let app = express();

app.set('view engine', 'ejs');

app.get('/', (req, res) => {
res.render('index', {foo: 'FOO'});
});

app.listen(4000, () => console.log('Example app listening on port 4000!'));

Here, the output will be :

Hello FOO

There are a number of ways to pass specific configuration values to EJS from Express.
View options

This is the most straightforward method, although view options has not been a documented option to use with Express since version 2. Use app.set to set view options:

app.set('view options', {delimiter: '?'});

This method works for all options, even those which cannot be safely passed along with data, like root. It also allows you to set EJS options once, in one place.
Custom render function

This is somewhat less straightforward, but also works well -- completely overrides the render function:

let ejsOptions = {delimiter: '?'};
app.engine('ejs', (path, data, cb) => {
ejs.renderFile(path, data, ejsOptions, cb);
});

This method works for all options, even those which cannot be safely passed along with data, like root. It also allows you to set EJS options once, in one place.
App locals

Any properties set on app.locals will get mixed in to the data object passed into a render call for the view engine, and those with names matching known opts properties will be passed to EJS as opts:

app.locals.delimiter = '?'

This does allow you to set your EJS options in one place, but will not work for unsafe options like root.
Passing opts with data

Any properties in the data object for a render call with names matching known opts properties will be passed to EJS as opts:

app.get('/', (req, res) => {
res.render('index', {foo: 'FOO', delimiter: '?'});
});

This approach means you have to pass EJS options in every single render call, and also does not work with unsafe options like root.
Including components in webpage

If you work on developing a web page that includes several components you don't want to copy and paste every time, or even see as part of your code, you can simply create a component-like [ejs] file and include it in your [HTML] code.

Here's an example:

<!-- navbar.ejs -->
<nav class="navbar">
  <ul class="navbar-blocks">
    <% for (var i = 0; i < links.length; i++) { %>
      <li class="nav-icon">
        <a href="<%= links[i].href %>" class="nav-link">
          <%= links[i].icon %>
          <span class="link-text"><%= links[i].text %></span>
        </a>
      </li>
    <% } %>
  </ul>
</nav>

Now in your main file you can simply include this [ejs] file, and it'll render when loaded from the server:

<!-- main.ejs -->
<HTML>
  <head>
    <title> Homepage </title>
  </head>
  <body>
    <% include navbar.ejs %>
    <!-- Here you can add those JS variables, because the page will render everything and find them when he loads the included file-->
    <script>
      const links = [
        {
          href: '/',
          icon: '<svg>...</svg>',
          text: 'Home'
        },
        {
          href: 'collection',
          icon: '<svg>...</svg>',
          text: 'Collection'
        },
        {
          href: 'live',
          icon: '<svg>...</svg>',
          text: 'Live'
        }
      ];
    </script>
  </body>
</html>

Once the page is loaded the navbar component will be presented as if it was part of the original [HTML] code.

This approach is better than using [React] because if you want a static page without too much of live-render sources expended on it - using [ejs] is the best option, as presented up here.
