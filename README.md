# Places - Wikipedia

Find places from Wikipedia and display them on a map.

This is not a stand-alone plugin, to use, install along side [Places](https://community.obsidian.md/plugins/places). Refer to the [sandbox](https://sandbox.obsidian.stanton.dev/places/) for examples.

Populate a VaultQuery table with a search:

```places-wikipedia-vaultquery
id: scranton
location: 41.4086, -75.6624
radius: 10km
limit: 50
language: en
cache: 24h
```

Display results on a map:

````markdown
```places
query: |
  SELECT *
  FROM wiki_places
  WHERE search_id = 'scranton'
  ORDER BY distance_m
popup:
  content:
    - renderer: wikipedia.summary
```
````

| Columns                               | Contents                         |
| ------------------------------------- | -------------------------------- |
| `search_id`, `wiki`, `page_id`        | Search and article identifiers   |
| `title`, `url`                        | Article title and link           |
| `location`                            | Coordinates for Places           |
| `latitude`, `longitude`, `distance_m` | Numeric coordinates and distance |
| `type`, `country`, `region`           | Optional geographic metadata     |
| `description`                         | Optional introductory text       |
| `thumbnail_url`, `thumbnail_page_url` | Optional image and credits page  |

