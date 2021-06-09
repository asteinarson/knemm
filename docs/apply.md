## [Back to index](index.md)

# apply

```
knemm apply [options] [claims...]
```

The command does the same as `join` except that as a last step applies all changes to a
database schema. 

## Example
```
$ knemm apply -s my-app-state -d @pg:my-app Person_2.yaml Product_4.yaml 
```

The command will apply given claims onto `my-app-state` and then sync the database specified
by `@pg:my-app`. (To associate a given state with a particular database, use 
the [connect](connect.md) command).

## Options

Most options for [join](join.md) also are valid for `apply`. Here are the `apply` specific ones: 
| Short form | Long form | Explanation | 
| --- | --- | --- | 
| `-d <db_spec>` | `--database <db_spec>` | The database to sync with the state. [dbspec docs.](dbspec.md) | 
| `-Q ` | `--show-queries` | Show generated SQL queries (instead of executing them). |


