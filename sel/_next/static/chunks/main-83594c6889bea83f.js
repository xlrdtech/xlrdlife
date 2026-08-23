<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page Not Found</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f5f5f5;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .container {
        text-align: center;
        padding: 2rem;
      }

      .error-code {
        font-size: 8rem;
        font-weight: bold;
        color: #2d3436;
        margin-bottom: 1rem;
        animation: float 6s ease-in-out infinite;
      }

      .error-message {
        font-size: 1.5rem;
        color: #636e72;
        margin-bottom: 2rem;
      }

      .home-link {
        display: inline-block;
        padding: 1rem 2rem;
        background-color: #0984e3;
        color: white;
        text-decoration: none;
        border-radius: 5px;
        transition: background-color 0.3s ease;
      }

      .home-link:hover {
        background-color: #0069d9;
      }

      @keyframes float {
        0% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-20px);
        }
        100% {
          transform: translateY(0);
        }
      }

      @media (max-width: 768px) {
        .error-code {
          font-size: 6rem;
        }

        .error-message {
          font-size: 1.2rem;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="error-code">404</div>
      <div class="error-message">
        Oops! The page you're looking for doesn't exist.
      </div>
    </div>
  </body>
</html>
