## [Back to index](index.md)

# drop
```
knedb drop <db_spec> <name_of_db>
```
The command will drop (delete) a database according to `dbspec` named `name_of_db`. If the name of 
the new database is included in `dbspec` (as maybe when refering to a JSON/YAML file with connection info), then it is enough to give a colon - `:` - meaning it will use the name given. Otherwise, we can override the name with the second arg. 

[More info on `dbspec` here.](dbspec.md)

## Example
```bash 
$ knedb drop arst?the_pass@pg:test14 : 
Database <test14> on client type <pg> was dropped.
```

When using a DB connection file `my_db.json`: 
```bash
$ knedb drop %my_db.json my_new_db
Database <my_new_db> on client type <mysql> was dropped.
```

## Options

| Short form | Long form | Explanation | 
| --- | --- | --- | 
| `-s ` | `--state <dir>` | If a state is given, and `dbspec` and `name_of_db` matches with this state, the DB is disconnected from it | 

