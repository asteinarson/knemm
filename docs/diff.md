## [Back to index](index.md)

# diff 
**The diff command is still preliminary!** 
```
knemm diff [options] <candidate> <target>
```
The command will compare two states (or claims), and show the diff required for `candidate` to fulfill `target`. To illustrate the comparison done, we can use two versions of the same table: 

### The candidate:
| Column | Type | 
| --- | --- |
| id | int pk auto_inc |  
| email | varchar(255) unique |  
| first_name | varchar(64) |  
 

### The target: 
| Column | Type | 
| --- | --- |
| id | int pk auto_inc |  
| email | varchar(255) unique |  
| first_name | varchar(64) |  
| second_name | varchar(64) |  
 
 Now, the target equals the candidate on the first three columns. However, it has an additional
 column `second_name`. So the diff will show that extra column. 

**NOTE:** `diff` is not symmetrical. It says what is required to change one state (the **candidate**) to match another state (the **target**). 

## Example
The states above are described in `Person_1.yaml` and `Person_2.yaml`. However the last is a claim
building on the first one. To get the a state from that we do: 
```
$ knemm join -s Person_2-state Person_2.yaml
```

Now we can now compare them: 
```
$ knemm diff Person_1.yaml Person_2-state
person:
  second_name:
    max_length: 64
    data_type: varchar
```

Then we try reversing the order: 
```bash
$ knemm diff Person_2-state Person_1.yaml
{}
```
We got an empty diff back. It means that `Person_2` (as a state) actually matches `Person_1` as it already is. This makes sense as `Person_2` is just a simple addition to `Person_1`.


## Options

The options are mostly the same as for the [join command](join.md). 

