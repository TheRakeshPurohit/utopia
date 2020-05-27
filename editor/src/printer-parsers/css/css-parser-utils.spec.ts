import { syntaxParsers } from './css-parser-map'

describe('CSS PARSER', () => {
  it('backgroundSize', () => {
    const value = 'auto, contain, 100% 100%, 100px auto, cover, 0 0'
    const parseResults = syntaxParsers["<'background-size'>"](value)
    expect(parseResults).toMatchInlineSnapshot(`
      Object {
        "type": "RIGHT",
        "value": Array [
          Object {
            "size": Object {
              "default": true,
              "value": Object {
                "type": "parsed-curly-brace",
                "value": Array [
                  Object {
                    "type": "keyword",
                    "value": "auto",
                  },
                ],
              },
            },
            "type": "bg-size",
          },
          Object {
            "size": Object {
              "default": true,
              "value": Object {
                "type": "keyword",
                "value": "contain",
              },
            },
            "type": "bg-size",
          },
          Object {
            "size": Object {
              "default": true,
              "value": Object {
                "type": "parsed-curly-brace",
                "value": Array [
                  Object {
                    "unit": "%",
                    "value": 100,
                  },
                  Object {
                    "unit": "%",
                    "value": 100,
                  },
                ],
              },
            },
            "type": "bg-size",
          },
          Object {
            "size": Object {
              "default": true,
              "value": Object {
                "type": "parsed-curly-brace",
                "value": Array [
                  Object {
                    "unit": "px",
                    "value": 100,
                  },
                  Object {
                    "type": "keyword",
                    "value": "auto",
                  },
                ],
              },
            },
            "type": "bg-size",
          },
          Object {
            "size": Object {
              "default": true,
              "value": Object {
                "type": "keyword",
                "value": "cover",
              },
            },
            "type": "bg-size",
          },
          Object {
            "size": Object {
              "default": true,
              "value": Object {
                "type": "parsed-curly-brace",
                "value": Array [
                  Object {
                    "unit": null,
                    "value": 0,
                  },
                  Object {
                    "unit": null,
                    "value": 0,
                  },
                ],
              },
            },
            "type": "bg-size",
          },
        ],
      }
    `)
  })
})
