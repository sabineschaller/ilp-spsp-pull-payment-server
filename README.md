# ILP SPSP Pull Payment Server
> SPSP server that supports pull payments

- [Usage](#usage)
- [Environment Variables](#environment-variables)
- [API](#api)
  - [Create a pull pointer](#create-a-pull-pointer)
  - [Query a pull pointer](#query-a-pull-pointer)
  - [Webhooks](#webhooks)

## Usage

Make sure you have a running instance of **moneyd**. 

Start the server
```sh
SPSP_LOCALTUNNEL=true SPSP_LOCALTUNNEL_SUBDOMAIN=mysubdomain npm start
```
Online creation of a pull pointer (information about the query parameters are in section [Request](###Request))

```http
http POST mysubdomain.localtunnel.me amount=100 interval=P0Y0M0DT0H1M cycles=10 cap=false assetCode=XRP assetScale=6 Authorization:"Bearer test"
HTTP/1.1 200 OK
Connection: keep-alive
Content-Length: 78
Content-Type: application/json; charset=utf-8
Date: Thu, 09 May 2019 16:56:34 GMT
Server: nginx/1.10.1

{
    "pointer": "$mysubdomain.localtunnel.me/484f126f-0c22-4052-9c9d-7af70500360a"
}
```
Query the pull pointer
```sh
ilp-spsp query -p '$mysubdomain.localtunnel.me/484f126f-0c22-4052-9c9d-7af70500360a'
{
  "destinationAccount": "private.moneyd.local.BFTRSlyMxz_62Ia7N58b83de5730op6sJKtWfj-58Tg.MnTMFWKMbSVZH9KCK2cf7N3X~484f126f-0c22-4052-9c9d-7af70500360a",
  "sharedSecret": "wI3zrb9KhQQYnWuKLNG28sEAr+AJvnJqlfUJBpIJIvA=",
  "pull": {
    "balance": {
      "total": "0",
      "interval": "0",
      "available": "100"
    }
  },
  "contentType": "application/spsp4+json"
}
```

Pull from that endpoint (!!! For this to work, you have to run a version of ilp-spsp that supports pull payments)
```sh
ilp-spsp pull -a 100000 -p '$mysubdomain.localtunnel.me/484f126f-0c22-4052-9c9d-7af70500360a'
pulling from "$mysubdomain.localtunnel.me/484f126f-0c22-4052-9c9d-7af70500360a"...
pulled 100000 units!
```

Query again
```sh
ilp-spsp query -p '$mysubdomain.localtunnel.me/484f126f-0c22-4052-9c9d-7af70500360a'
{
  "destinationAccount": "private.moneyd.local.BFTRSlyMxz_62Ia7N58b83de5730op6sJKtWfj-58Tg.9gmxwFKKnDehiwxhqGXal0S8~484f126f-0c22-4052-9c9d-7af70500360a",
  "sharedSecret": "2JUsKSvjjarJENBuI8KqWoyxDHQU2V3XvzsSc2+BtrU=",
  "pull": {
    "balance": {
      "total": "100",
      "interval": "100",
      "available": "0"
    }
  },
  "contentType": "application/spsp4+json"
}
```

### Using an offline-generated pull pointer

A pull pointer can also be created offline by generating a JWT containing all the necessary [parameters](####Request) and signing it with the same secret ([SPSP_JWT_SECRET](##Environment-Variables)) used by the server. If the client tries to pull using an offline generated pull pointer, the server will try to verify it and if it can, it will allow the pull. 

Here is an example of a valid JWT:

```jwt
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhbW91bnQiOiIxMDAiLCJpbnRlcnZhbCI6IlAwWTBNMERUMEgxTSIsImN5Y2xlcyI6IjEwIiwiY2FwIjoiZmFsc2UiLCJhc3NldENvZGUiOiJYUlAiLCJhc3NldFNjYWxlIjoiNiJ9.9-3t5Xps81O_T5kaKBTlvkrjJgvP0V1XW2HR0coIqyE
```

### Making a push payment to the SPSP server
```sh
ilp-spsp send -a 100 -p '$mysubdomain.localtunnel.me'
paying 100 to "$mysubdomain.localtunnel.me"...
sent!
```

## Environment Variables

| Name | Default | Description |
|:---|:---|:---|
| `SPSP_PORT` | `6000` | port to listen on locally. |
| `SPSP_LOCALTUNNEL` | | If this variable is defined, `SPSP_PORT` will be proxied by localtunnel under `SPSP_LOCALTUNNEL_SUBDOMAIN`. |
| `SPSP_LOCALTUNNEL_SUBDOMAIN` | | Subdomain to forward `SPSP_PORT` to. Must be defined if you set `SPSP_LOCALTUNNEL` |
| `SPSP_DB_PATH` | | Path for leveldb database. Uses in-memory database if unspecified. |
| `SPSP_JWT_SECRET` | `test` | Secret used for token generation and verification. |
| `SPSP_AUTH_TOKEN` | `test` | Bearer token for creating invoices and receiving webhooks. |
| `SPSP_HOST` | localhost or localtunnel | Host to include in payment pointers |

## API

### Create a pull pointer

```http
POST /
```

Requires authentication. Creates a pull pointer.

#### Request

- `amount` -  Amount available each interval.
- `start` - _(Optional)_ [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) UTC timestamp
- `expiry` - _(Optional)_ [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) UTC timestamp
- `interval` - [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) duration
- `cycles` - Number of repititions of the interval; defines the expiry of the endpoint.
- `cap` - If `true`, maximum pullable amount per interval is `amount` (_use it or loose it_); if `false`, maximum pullable amount per interval is the accumulation of funds that have not been pulled.
- `assetCode` - Asset the pull payment is made in.
- `assetScale` - Scale the asset is measured in. If `amount` equal to `1000`, `assetCode` equal to `USD` and `assetScale` equal to `2`, amount denotes 10.00 USD.
- `webhook` - (Optional) Webhook to `POST` to after the endpoint has been pulled from. See [Webhooks](#webhooks)

#### Response

- `pointer` - Pull pointer.

### Query a pull pointer

```http
GET /:token
```
Needs the header `Accept:"application/spsp4+json"`.

SPSP endpoint storing the information to set up a STREAM connection for pulling from the unique pull pointer with id `:token`. The pull pointer
returned by [Create a pull pointer](#create-a-pull-pointer) resolves to this endpoint.

### Webhooks

When you [Create a pull pointer](#create-a-pull-pointer) and specify a webhook, it will
call the specified webhook when the payment has been pulled. The request is a `POST` with

```http
Authorization: Bearer <SPSP_AUTH_TOKEN>

{
  "balanceTotal": "400",
  "balanceInterval": "100",
  "pointer": "$mysubdomain.localtunnel.me/484f126f-0c22-4052-9c9d-7af70500360a"
}
```
